const axios = require('axios');
const Claim = require('../models/Claim');
const User = require('../models/User');
const { extractReceiptData, validateDateMatch } = require('./ocrService');
const { getGeminiLimiter } = require('./geminiRateLimiter');

/**
 * Converts currency amount to USD using a free exchange rate API.
 */
async function convertToUSD(amount, currency) {
  if (!amount || !currency || currency === 'USD') return amount;
  try {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;
    const res = await axios.get(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/${currency}`);
    const rate = res.data.conversion_rates?.USD;
    if (rate) return Math.round(amount * rate * 100) / 100;
  } catch {
    console.warn(`[auditEngine] FX conversion failed for ${currency} → USD`);
  }
  return amount;
}

/**
 * Queries the Python policy engine to get relevant policy rules.
 */
async function queryPolicyEngine(category, amountUSD, location, businessPurpose) {
  try {
    const engineUrl = process.env.POLICY_ENGINE_URL || 'http://localhost:8000';
    const res = await axios.post(`${engineUrl}/query`, {
      category, amountUSD, location, businessPurpose,
    }, { timeout: 15000 });
    return res.data.policyChunks || [];
  } catch (err) {
    console.warn('[auditEngine] Policy engine unavailable:', err.message);
    return [];
  }
}

/**
 * Detects anomalous spending vs. employee's historical average for that category.
 */
async function detectAnomaly(employeeId, category, amountUSD) {
  if (!amountUSD || !category) return { isAnomaly: false };
  try {
    const stats = await Claim.aggregate([
      { $match: { employee: employeeId, 'extractedData.category': category, auditStatus: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$extractedData.amountUSD' }, stdDev: { $stdDevSamp: '$extractedData.amountUSD' }, count: { $sum: 1 } } },
    ]);
    if (!stats.length || stats[0].count < 3) return { isAnomaly: false };
    const { avg, stdDev } = stats[0];
    const zScore = stdDev > 0 ? Math.abs(amountUSD - avg) / stdDev : 0;
    return { isAnomaly: zScore > 2, zScore: Math.round(zScore * 10) / 10, avg: Math.round(avg) };
  } catch {
    return { isAnomaly: false };
  }
}

/**
 * Core audit function: calls LLM to classify the claim against policy rules.
 * Uses GeminiRateLimiter for queued, rate-safe calls with key rotation & model fallback.
 */
async function runLLMAudit({ extractedData, businessPurpose, employee, policyChunks, anomaly }) {
  const limiter = getGeminiLimiter();

  const prompt = `You are an expert corporate expense policy auditor. Analyze this expense claim and return a compliance verdict.

EMPLOYEE PROFILE:
- Location: ${employee.location || 'unknown'}
- Seniority: ${employee.seniority || 'mid'}

EXPENSE CLAIM:
- Merchant: ${extractedData.merchantName || 'Unknown'}
- Date: ${extractedData.date || 'Unknown'}
- Amount: ${extractedData.amountUSD} USD (original: ${extractedData.amount} ${extractedData.currency})
- Category: ${extractedData.category}
- Business Purpose: "${businessPurpose}"
- Statistical Anomaly: ${anomaly.isAnomaly ? `YES — ${anomaly.zScore}x standard deviation above employee avg ($${anomaly.avg})` : 'No'}

RELEVANT POLICY RULES:
${policyChunks.length > 0 ? policyChunks.join('\n\n') : 'No specific policy rules found for this category. Apply general prudent expense judgment.'}

TASK: Based on the policy rules and claim details, return ONLY a valid JSON (no markdown):
{
  "status": "approved" | "flagged" | "rejected",
  "riskLevel": "low" | "medium" | "high",
  "explanation": "One sentence citing the specific rule, e.g. 'Rejected: Meal limit for New York is $50; claim was for $75'",
  "policyRulesCited": ["exact rule text snippet 1", "rule 2"],
  "flags": {
    "overLimit": boolean,
    "contextualMismatch": boolean,
    "anomalousAmount": boolean
  }
}

Guidelines:
- If amount is within 10% of limit, use "flagged" not "approved"
- If no matching policy rule, use judgment and "flagged" with explanation
- If business purpose seems inconsistent with merchant type or day, flag contextualMismatch`;

  try {
    const result = await limiter.generateContent(prompt);
    const text = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (err) {
    console.error('[auditEngine] LLM audit failed:', err.message);
    return {
      status: 'flagged',
      riskLevel: 'medium',
      explanation: 'Automated audit could not complete. Manual review required.',
      policyRulesCited: [],
      flags: {},
    };
  }
}

/**
 * Main async processing pipeline — called after claim is created.
 */
async function processClaimAsync(claimId, employee, imagePath) {
  const start = Date.now();
  
  try {
    await Claim.findByIdAndUpdate(claimId, { auditStatus: 'processing' });
    const claim = await Claim.findById(claimId);

    // 1. OCR Extraction (uses rate limiter + cache internally)
    const extracted = await extractReceiptData(imagePath);

    // Handle unreadable receipt
    if (!extracted.isReadable || extracted.confidence < 0.4) {
      await Claim.findByIdAndUpdate(claimId, {
        auditStatus: 'flagged',
        riskLevel: 'medium',
        aiExplanation: `Receipt image quality is too low (confidence: ${Math.round(extracted.confidence * 100)}%). Please resubmit a clearer image.`,
        'extractedData.ocrConfidence': extracted.confidence,
        'flags.blurryImage': true,
        processingDurationMs: Date.now() - start,
      });
      return;
    }

    // 2. Currency normalization
    const amountUSD = await convertToUSD(extracted.amount, extracted.currency);

    // 3. Date mismatch check
    const dateCheck = validateDateMatch(extracted.date, claim.claimedDate);

    // 4. Query policy engine
    const policyChunks = await queryPolicyEngine(
      extracted.category, amountUSD, employee.location, claim.businessPurpose
    );

    // 5. Anomaly detection
    const anomaly = await detectAnomaly(employee._id, extracted.category, amountUSD);

    // 6. LLM Audit (uses rate limiter internally)
    const verdict = await runLLMAudit({
      extractedData: { ...extracted, amountUSD },
      businessPurpose: claim.businessPurpose,
      employee,
      policyChunks,
      anomaly,
    });

    // 7. Save result
    await Claim.findByIdAndUpdate(claimId, {
      extractedData: {
        merchantName: extracted.merchantName,
        date: extracted.date ? new Date(extracted.date) : null,
        amount: extracted.amount,
        currency: extracted.currency,
        amountUSD,
        category: extracted.category,
        rawText: extracted.rawText,
        ocrConfidence: extracted.confidence,
      },
      auditStatus: verdict.status,
      riskLevel: verdict.riskLevel,
      aiExplanation: verdict.explanation,
      policyRulesCited: verdict.policyRulesCited || [],
      'flags.dateMismatch': !dateCheck.match,
      'flags.overLimit': verdict.flags?.overLimit || false,
      'flags.contextualMismatch': verdict.flags?.contextualMismatch || false,
      'flags.anomalousAmount': anomaly.isAnomaly,
      processingDurationMs: Date.now() - start,
    });

    // 8. Update employee compliance score
    const user = await User.findById(employee._id);
    user.totalClaims += 1;
    if (verdict.status === 'approved') user.approvedClaims += 1;
    user.updateComplianceScore();
    await user.save();

  } catch (error) {
    console.error('[auditEngine] Pipeline error:', error.message);
    await Claim.findByIdAndUpdate(claimId, {
      auditStatus: 'flagged',
      riskLevel: 'medium',
      aiExplanation: 'Audit pipeline error. Manual review required.',
      processingError: error.message,
      processingDurationMs: Date.now() - start,
    });
  }
}

module.exports = { processClaimAsync };
