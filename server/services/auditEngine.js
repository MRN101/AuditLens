const axios = require('axios');
const Claim = require('../models/Claim');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { extractReceiptData, validateDateMatch } = require('./ocrService');
const { getGeminiLimiter } = require('./geminiRateLimiter');
const { preprocessImage } = require('./imagePreprocessor');
const { sendClaimStatusEmail } = require('./emailService');
const { checkDuplicate, computePerceptualHash } = require('./duplicateDetector');

const BASE_CURRENCY = process.env.BASE_CURRENCY || 'INR';
const BASE_SYMBOL = process.env.BASE_CURRENCY_SYMBOL || '₹';

// ─── Exchange Rate Cache (1 hour TTL) ───
const fxCache = new Map();
const FX_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Converts currency amount to the configured base currency (default: INR).
 * Caches exchange rates in-memory for 1 hour to avoid redundant API calls.
 */
async function convertToBaseCurrency(amount, fromCurrency) {
  if (!amount || !fromCurrency) return amount;
  const from = fromCurrency.toUpperCase();
  if (from === BASE_CURRENCY.toUpperCase()) return amount;
  
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) {
    console.warn(`[auditEngine] ⚠ No EXCHANGE_RATE_API_KEY set — cannot convert ${from} → ${BASE_CURRENCY}`);
    return amount;
  }

  // Check cache first
  const cacheKey = `${from}_${BASE_CURRENCY}`;
  const cached = fxCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < FX_CACHE_TTL) {
    const converted = Math.round(amount * cached.rate * 100) / 100;
    console.log(`[auditEngine] 💱 ${amount} ${from} × ${cached.rate} = ${converted} ${BASE_CURRENCY} (cached)`);
    return converted;
  }

  try {
    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${from}`;
    const res = await axios.get(url, { timeout: 10000 });
    const rate = res.data.conversion_rates?.[BASE_CURRENCY.toUpperCase()];
    if (rate) {
      // Cache the rate
      fxCache.set(cacheKey, { rate, timestamp: Date.now() });
      const converted = Math.round(amount * rate * 100) / 100;
      console.log(`[auditEngine] 💱 ${amount} ${from} × ${rate} = ${converted} ${BASE_CURRENCY} (fresh)`);
      return converted;
    }
    console.warn(`[auditEngine] ⚠ No rate found for ${from} → ${BASE_CURRENCY}`);
  } catch (err) {
    // Fall back to stale cache if available
    if (cached) {
      const converted = Math.round(amount * cached.rate * 100) / 100;
      console.warn(`[auditEngine] ⚠ API failed, using stale cache: ${amount} ${from} × ${cached.rate} = ${converted} ${BASE_CURRENCY}`);
      return converted;
    }
    console.error(`[auditEngine] ❌ FX conversion failed (${from} → ${BASE_CURRENCY}):`, err.message);
  }
  return amount;
}
/**
 * Built-in default policy rules used when the Python policy engine is unavailable.
 */
const DEFAULT_POLICY_RULES = {
  meals: [
    'MEALS POLICY: Daily meal allowance is ₹1,500 (domestic) or $80 (international).',
    'Business purpose must be stated for meals above ₹750.',
    'Alcohol expenses are NOT reimbursable under any circumstance.',
    'Team meals for groups > 4 people require attendee names.',
  ],
  travel: [
    'TRAVEL POLICY: Economy class required for flights under 4 hours.',
    'Taxi/ride-share claims must include pickup and drop-off locations.',
    'Mileage reimbursement: ₹9/km for personal vehicle use.',
    'Rental cars require prior written manager approval.',
  ],
  accommodation: [
    'ACCOMMODATION POLICY: Nightly hotel limit is ₹5,000 (tier-2 cities) or ₹8,000 (metro cities).',
    'International accommodation: up to $200/night.',
    'Hotel stays exceeding nightly limits require prior approval.',
    'Laundry, minibar, and room service charges are NOT covered.',
  ],
  other: [
    'GENERAL POLICY: All receipts must be submitted within 30 days of the expense date.',
    'Claims without valid receipt images are automatically flagged for review.',
    'Duplicate receipts are automatically rejected.',
    'Amounts exceeding 2x the category average trigger anomaly review.',
  ],
};

/**
 * Get the appropriate default rules for a given category.
 */
function getDefaultRules(category) {
  const cat = (category || '').toLowerCase();
  const rules = [...(DEFAULT_POLICY_RULES.other)];
  if (cat.includes('meal') || cat.includes('food') || cat.includes('dining') || cat.includes('restaurant')) {
    rules.unshift(...DEFAULT_POLICY_RULES.meals);
  } else if (cat.includes('travel') || cat.includes('transport') || cat.includes('taxi') || cat.includes('flight')) {
    rules.unshift(...DEFAULT_POLICY_RULES.travel);
  } else if (cat.includes('hotel') || cat.includes('accommodation') || cat.includes('lodging')) {
    rules.unshift(...DEFAULT_POLICY_RULES.accommodation);
  } else {
    // Include all category rules for unknown categories
    rules.unshift(...DEFAULT_POLICY_RULES.meals, ...DEFAULT_POLICY_RULES.travel, ...DEFAULT_POLICY_RULES.accommodation);
  }
  return rules;
}

/**
 * Queries the Python policy engine to get relevant policy rules.
 * Falls back to built-in default rules if the engine is unavailable.
 */
async function queryPolicyEngine(category, amountBase, location, businessPurpose, tripType) {
  try {
    const engineUrl = process.env.POLICY_ENGINE_URL || 'http://localhost:8000';
    const res = await axios.post(`${engineUrl}/query`, {
      category, amountBase, location, businessPurpose, tripType,
    }, { timeout: 15000 });
    const chunks = res.data.policyChunks || [];
    return chunks.length > 0 ? chunks : getDefaultRules(category);
  } catch (err) {
    console.warn('[auditEngine] Policy engine unavailable, using built-in rules');
    return getDefaultRules(category);
  }
}

/**
 * Detects anomalous spending vs. employee's historical average for that category.
 */
async function detectAnomaly(employeeId, category, amountBase) {
  if (!amountBase || !category) return { isAnomaly: false };
  try {
    const stats = await Claim.aggregate([
      { $match: { employee: employeeId, 'extractedData.category': category, auditStatus: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$extractedData.amountBase' }, stdDev: { $stdDevSamp: '$extractedData.amountBase' }, count: { $sum: 1 } } },
    ]);
    if (!stats.length || stats[0].count < 3) return { isAnomaly: false };
    const { avg, stdDev } = stats[0];
    const zScore = stdDev > 0 ? Math.abs(amountBase - avg) / stdDev : 0;
    return { isAnomaly: zScore > 2, zScore: Math.round(zScore * 10) / 10, avg: Math.round(avg) };
  } catch {
    return { isAnomaly: false };
  }
}

/**
 * Validate claimed amount against OCR-extracted amount (if employee provided one)
 */
function validateAmountMatch(extractedAmount, claimedAmount) {
  if (!claimedAmount || !extractedAmount) return { match: null };
  const diff = Math.abs(extractedAmount - claimedAmount);
  const threshold = claimedAmount * 0.1;
  return {
    match: diff <= threshold,
    diff,
    message: diff > threshold
      ? `Claimed amount (${claimedAmount}) differs from receipt amount (${extractedAmount}) by ${diff.toFixed(2)}`
      : 'Amounts match',
  };
}

/**
 * Core audit function: calls LLM to classify the claim against policy rules.
 * Now receives line items, tax breakdown, and duplicate info for richer analysis.
 */
async function runLLMAudit({ extractedData, businessPurpose, employee, policyChunks, anomaly, tripType, lineItems, taxBreakdown, duplicateInfo, validationFlags }) {
  const limiter = getGeminiLimiter();

  const lineItemsSummary = lineItems?.length > 0
    ? `\nLINE ITEMS (${lineItems.length}):\n${lineItems.map(i => `  - ${i.description}: ${i.quantity}× @ ${extractedData.currency} ${i.unitPrice} = ${extractedData.currency} ${i.totalPrice}`).join('\n')}`
    : '';

  const taxSummary = taxBreakdown?.subtotal
    ? `\nTAX BREAKDOWN: Subtotal=${BASE_SYMBOL}${taxBreakdown.subtotal}, Tax=${BASE_SYMBOL}${taxBreakdown.taxAmount || 0}${taxBreakdown.taxPercent ? ` (${taxBreakdown.taxPercent}%)` : ''}, Tip=${BASE_SYMBOL}${taxBreakdown.tipAmount || 0}, Discount=-${BASE_SYMBOL}${taxBreakdown.discountAmount || 0}, Total=${BASE_SYMBOL}${taxBreakdown.total}\n  Math valid: ${taxBreakdown.mathValid ? 'YES' : 'NO — ' + (taxBreakdown.mathDetails || 'mismatch')}`
    : '';

  const duplicateWarning = duplicateInfo?.isDuplicate
    ? `\n⚠️ DUPLICATE ALERT: This receipt matches a previous submission (${duplicateInfo.matchType} match, ${duplicateInfo.similarity}% similarity)`
    : '';

  const validationWarning = validationFlags?.length > 0
    ? `\n⚠️ CROSS-VALIDATION ISSUES:\n${validationFlags.map(f => `  - [${f.severity.toUpperCase()}] ${f.message}`).join('\n')}`
    : '';

  const prompt = `You are an expert corporate expense policy auditor. Analyze this expense claim and return a compliance verdict.

EMPLOYEE PROFILE:
- Location: ${employee.location || 'unknown'}
- Seniority: ${employee.seniority || 'mid'}

TRIP TYPE: ${tripType === 'international' ? 'INTERNATIONAL — apply international expense limits (typically higher)' : 'DOMESTIC — apply standard domestic expense limits'}

EXPENSE CLAIM:
- Merchant: ${extractedData.merchantName || 'Unknown'}
- Date: ${extractedData.date || 'Unknown'}
- Amount: ${BASE_SYMBOL}${extractedData.amountBase} ${BASE_CURRENCY} (original: ${extractedData.amount} ${extractedData.currency})
- Category: ${extractedData.category}
- Business Purpose: "${businessPurpose}"
- Payment Method: ${extractedData.paymentMethod || 'unknown'}
- Statistical Anomaly: ${anomaly.isAnomaly ? `YES — ${anomaly.zScore}x standard deviation above employee avg (${BASE_SYMBOL}${anomaly.avg})` : 'No'}
${lineItemsSummary}${taxSummary}${duplicateWarning}${validationWarning}

RELEVANT POLICY RULES:
${policyChunks.length > 0 ? policyChunks.join('\n\n') : 'No specific policy rules found for this category. Apply general prudent expense judgment.'}

TASK: Based on the policy rules and claim details, return ONLY a valid JSON (no markdown):
{
  "status": "approved" | "flagged" | "rejected",
  "riskLevel": "low" | "medium" | "high",
  "explanation": "One sentence citing the specific rule",
  "policyRulesCited": ["exact rule text snippet 1", "rule 2"],
  "flags": {
    "overLimit": boolean,
    "contextualMismatch": boolean,
    "anomalousAmount": boolean
  }
}

Guidelines:
- All amounts should be referenced in ${BASE_CURRENCY} (${BASE_SYMBOL})
- If amount is within 10% of limit, use "flagged" not "approved"
- If no matching policy rule, use judgment and "flagged" with explanation
- If business purpose seems inconsistent with merchant type or day, flag contextualMismatch
- If duplicate detected, ALWAYS set status to "rejected" with explanation
- If tax math doesn't add up, increase risk level
- If cross-validation issues have severity "error", always flag or reject the claim
- For international trips, apply appropriate international limits`;

  try {
    const result = await limiter.generateContent(prompt);
    const text = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
  } catch (err) {
    console.error('[auditEngine] LLM audit failed:', err.message);
    return {
      status: 'flagged', riskLevel: 'medium',
      explanation: 'Automated audit could not complete. Manual review required.',
      policyRulesCited: [], flags: {},
    };
  }
}

/**
 * Main async processing pipeline — called after claim is created.
 *
 * Pipeline stages:
 *   0. Image preprocessing (Sharp)
 *   1. Multi-pass OCR (classification → deep extraction → self-correction)
 *   2. Duplicate detection (exact hash + perceptual hash + metadata)
 *   3. Currency conversion to INR
 *   4. Date / amount validation
 *   5. Trip type detection
 *   6. Policy engine query
 *   7. Anomaly detection
 *   8. LLM audit verdict (now with line items + tax context)
 *   9. Save all results
 */
async function processClaimAsync(claimId, employee, imagePath) {
  const start = Date.now();
  
  try {
    await Claim.findByIdAndUpdate(claimId, { auditStatus: 'processing' });
    const claim = await Claim.findById(claimId);

    // ═══ STAGE 0: Image Preprocessing ═══
    const { processedPath, thumbnailPath } = await preprocessImage(imagePath);
    if (thumbnailPath) {
      await Claim.findByIdAndUpdate(claimId, { thumbnailImage: thumbnailPath });
    }

    // ═══ STAGE 1: Multi-Pass OCR ═══
    const extracted = await extractReceiptData(processedPath);

    AuditLog.log(claimId, null, 'ocr_completed',
      `OCR confidence: ${Math.round((extracted.confidence || 0) * 100)}%` +
      (extracted.correctionCount > 0 ? ` (${extracted.correctionCount} corrections)` : '') +
      (extracted.lineItems?.length > 0 ? ` — ${extracted.lineItems.length} line items` : ''),
      { merchantName: extracted.merchantName, amount: extracted.amount, currency: extracted.currency }
    );

    // ── Reject non-receipts ──
    if (extracted.isReceipt === false) {
      await Claim.findByIdAndUpdate(claimId, {
        auditStatus: 'rejected', riskLevel: 'high',
        aiExplanation: extracted.issues || `Upload rejected: not a valid receipt (detected as "${extracted.documentType}").`,
        receiptClassification: {
          isReceipt: false, documentType: extracted.documentType,
          confidence: extracted.confidence, reason: extracted.classificationReason,
        },
        'flags.notAReceipt': true,
        processingDurationMs: Date.now() - start,
      });
      AuditLog.log(claimId, null, 'rejected_not_receipt', extracted.issues);
      return;
    }

    // ── Handle API failure (confidence = 0 means extraction completely failed) ──
    if (extracted.confidence === 0 || extracted.confidence === undefined || extracted.confidence === null) {
      console.warn(`[auditEngine] ⚠️ OCR extraction failed for claim ${claimId} — likely API rate limit. Leaving as pending for retry.`);
      await Claim.findByIdAndUpdate(claimId, {
        auditStatus: 'pending',
        aiExplanation: 'AI processing temporarily unavailable. Use the re-audit button to try again.',
        processingDurationMs: Date.now() - start,
      });
      return;
    }

    // ── Flag genuinely low-quality images ──
    if (!extracted.isReadable && extracted.confidence < 0.2) {
      await Claim.findByIdAndUpdate(claimId, {
        auditStatus: 'flagged', riskLevel: 'medium',
        aiExplanation: `Receipt image quality is too low (confidence: ${Math.round((extracted.confidence || 0) * 100)}%). Please resubmit a clearer image.`,
        'extractedData.ocrConfidence': extracted.confidence,
        'flags.blurryImage': true,
        processingDurationMs: Date.now() - start,
      });
      return;
    }

    // ═══ STAGE 2: Duplicate Detection ═══
    const duplicateInfo = await checkDuplicate(imagePath, employee._id, extracted, claimId, claim.tripId);
    const pHash = await computePerceptualHash(imagePath);

    await Claim.findByIdAndUpdate(claimId, {
      perceptualHash: pHash,
      duplicateInfo: duplicateInfo.isDuplicate ? {
        isDuplicate: true, matchType: duplicateInfo.matchType,
        matchedClaimId: duplicateInfo.matchedClaimId, similarity: duplicateInfo.similarity,
      } : { isDuplicate: false },
    });

    if (duplicateInfo.isDuplicate) {
      AuditLog.log(claimId, null, 'duplicate_detected',
        `Duplicate receipt (${duplicateInfo.matchType}, ${duplicateInfo.similarity}% similar) → claim ${duplicateInfo.matchedClaimId}`);
    }

    // ═══ STAGE 3: Currency Conversion ═══
    const amountBase = await convertToBaseCurrency(extracted.amount, extracted.currency);

    // ═══ STAGE 4: Validation ═══
    const dateCheck = validateDateMatch(extracted.date, claim.claimedDate, claim.claimedDateEnd);
    const amountCheck = validateAmountMatch(extracted.amount, claim.claimedAmount);

    // ═══ STAGE 5: Trip Type ═══
    let tripType = claim.tripType || 'domestic';
    if (extracted.currency && extracted.currency.toUpperCase() !== BASE_CURRENCY.toUpperCase() && tripType === 'domestic') {
      tripType = 'international';
      await Claim.findByIdAndUpdate(claimId, { tripType: 'international' });
    }

    // ═══ STAGE 6: Policy Engine ═══
    const policyChunks = await queryPolicyEngine(
      extracted.category, amountBase, employee.location, claim.businessPurpose, tripType
    );

    // ═══ STAGE 7: Anomaly Detection ═══
    const anomaly = await detectAnomaly(employee._id, extracted.category, amountBase);

    // ═══ STAGE 8: LLM Audit ═══
    const verdict = await runLLMAudit({
      extractedData: { ...extracted, amountBase },
      businessPurpose: claim.businessPurpose,
      employee, policyChunks, anomaly, tripType,
      lineItems: extracted.lineItems,
      taxBreakdown: extracted.taxBreakdown,
      duplicateInfo,
      validationFlags: extracted.validationFlags || [],
    });

    // Force-reject duplicates
    if (duplicateInfo.isDuplicate && verdict.status !== 'rejected') {
      verdict.status = 'rejected';
      verdict.riskLevel = 'high';
      verdict.explanation = `Duplicate receipt (${duplicateInfo.matchType} match, ${duplicateInfo.similarity}% similarity). ${verdict.explanation}`;
    }

    // Force-flag if cross-validation found errors
    const validationErrors = (extracted.validationFlags || []).filter(f => f.severity === 'error');
    if (validationErrors.length > 0 && verdict.status === 'approved') {
      verdict.status = 'flagged';
      verdict.riskLevel = verdict.riskLevel === 'low' ? 'medium' : verdict.riskLevel;
      verdict.explanation += ` [Cross-validation: ${validationErrors.map(e => e.message).join('; ')}]`;
    }

    // ═══ STAGE 9: Save ═══
    const mathError = extracted.taxBreakdown?.mathValid === false;

    await Claim.findByIdAndUpdate(claimId, {
      extractedData: {
        merchantName: extracted.merchantName,
        merchantAddress: extracted.merchantAddress || null,
        date: extracted.date ? new Date(extracted.date) : null,
        time: extracted.time || null,
        amount: extracted.amount,
        currency: extracted.currency,
        amountBase, baseCurrency: BASE_CURRENCY,
        category: extracted.category,
        rawText: extracted.rawText,
        ocrConfidence: extracted.confidence,
        paymentMethod: extracted.paymentMethod || 'unknown',
      },
      lineItems: extracted.lineItems || [],
      taxBreakdown: extracted.taxBreakdown || null,
      ocrCorrections: extracted.corrections || [],
      receiptClassification: { isReceipt: extracted.isReceipt, documentType: extracted.documentType },
      auditStatus: verdict.status,
      riskLevel: verdict.riskLevel,
      aiExplanation: verdict.explanation,
      policyRulesCited: verdict.policyRulesCited || [],
      'flags.dateMismatch': dateCheck.match === false,
      'flags.overLimit': verdict.flags?.overLimit || false,
      'flags.duplicateReceipt': duplicateInfo.isDuplicate,
      'flags.contextualMismatch': verdict.flags?.contextualMismatch || false,
      'flags.anomalousAmount': anomaly.isAnomaly,
      'flags.amountMismatch': amountCheck.match === false,
      'flags.mathError': mathError,
      'flags.crossValidationWarning': (extracted.validationFlags || []).length > 0,
      validationFlags: extracted.validationFlags || [],
      fieldConfidence: extracted.fieldConfidence || null,
      processingDurationMs: Date.now() - start,
    });

    // ═══ STAGE 10: Compliance Score ═══
    const user = await User.findById(employee._id);
    user.totalClaims += 1;
    if (verdict.status === 'approved') user.approvedClaims += 1;
    user.updateComplianceScore();
    await user.save();

    // ═══ STAGE 11: Audit Log ═══
    AuditLog.log(claimId, null, 'audit_completed', verdict.explanation, {
      status: verdict.status, riskLevel: verdict.riskLevel,
      processingMs: Date.now() - start,
      lineItemCount: extracted.lineItems?.length || 0,
      correctionCount: extracted.corrections?.length || 0,
      mathValid: extracted.taxBreakdown?.mathValid,
    });

    // ═══ STAGE 12: Email ═══
    sendClaimStatusEmail(employee, await Claim.findById(claimId), verdict.status).catch(() => {});

  } catch (error) {
    console.error('[auditEngine] Pipeline error:', error.message);
    await Claim.findByIdAndUpdate(claimId, {
      auditStatus: 'flagged', riskLevel: 'medium',
      aiExplanation: 'Audit pipeline error. Manual review required.',
      processingError: error.message,
      processingDurationMs: Date.now() - start,
    });
  }
}

module.exports = { processClaimAsync, convertToBaseCurrency };
