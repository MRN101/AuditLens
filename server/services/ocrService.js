const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getGeminiLimiter } = require('./geminiRateLimiter');
const { preprocessImage, RETRY_PIPELINES } = require('./imagePreprocessor');

/** Adaptive retry threshold — retry with enhanced preprocessing if below this */
const ADAPTIVE_RETRY_THRESHOLD = 0.7;

/** Skip self-correction pass if confidence is at or above this */
const SKIP_CORRECTION_THRESHOLD = 0.9;

/**
 * Compute MD5 hash of an image file for caching.
 */
function hashImage(imagePath) {
  try {
    const buffer = fs.readFileSync(imagePath);
    return crypto.createHash('md5').update(buffer).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Safely parse JSON — structured JSON mode should always return valid JSON,
 * but we have a fallback for edge cases.
 */
function safeParseJSON(text) {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const cleaned = text.trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  return null;
}

// ────────────────────────────────────────────────────────
// MERGED PROMPT: Classification + Deep Extraction in ONE call
// (Saves ~7s by eliminating a separate classification call)
// ────────────────────────────────────────────────────────

const UNIFIED_PROMPT = `You are an expert receipt OCR and document classification system. First determine if this image is a valid receipt/invoice, then extract ALL data if it is.

CRITICAL ANTI-HALLUCINATION RULES:
- ONLY extract text that is LITERALLY VISIBLE in the image. Do NOT guess, infer, or fabricate any value.
- If a field is not clearly readable, return null for that field — NEVER make up a plausible value.
- For merchantName: extract EXACTLY what is printed — do not "correct" it to a known brand name unless the text clearly matches.
- For amounts: extract ONLY numbers you can read. If a digit is ambiguous, flag it in issues.
- For dates: extract ONLY if a clear date is visible. Do NOT infer from context.
- It is better to return null than to return a wrong value.

Return a JSON object with these exact fields:

{
  "classification": {
    "isReceipt": boolean,
    "documentType": "receipt" | "invoice" | "bill" | "screenshot" | "photo" | "handwritten_note" | "other",
    "reason": "brief explanation"
  },

  "merchantName": "exact merchant/store name as printed, or null if not visible",
  "merchantAddress": "address if visible, or null",
  "date": "YYYY-MM-DD format or null",
  "time": "HH:MM format (24h) or null",

  "lineItems": [
    { "description": "item name", "quantity": number or 1, "unitPrice": number, "totalPrice": number }
  ],

  "subtotal": number or null,
  "taxAmount": number or null,
  "taxPercent": number or null,
  "tipAmount": number or null,
  "discountAmount": number or null,
  "serviceCharge": number or null,
  "totalAmount": number or null,

  "currency": "3-letter ISO code (USD, GBP, EUR, INR, SGD, AED etc.) or null",
  "paymentMethod": "cash | card | upi | online | unknown",
  "category": "one of: Meals, Transport, Lodging, Entertainment, Office Supplies, Other",

  "confidence": number between 0 and 1 (overall extraction confidence),
  "fieldConfidence": {
    "merchantName": number 0-1,
    "totalAmount": number 0-1,
    "date": number 0-1,
    "currency": number 0-1,
    "lineItems": number 0-1
  },
  "isReadable": boolean,
  "issues": "string describing problems, or null"
}

CLASSIFICATION RULES:
- If the image is NOT a receipt/invoice/bill, set classification.isReceipt = false and leave all other fields null
- A photo OF a receipt IS valid
- Handwritten bills with items + prices ARE valid (documentType = "handwritten_note")

EXTRACTION RULES (if isReceipt = true):
- Extract EVERY line item visible, not just the total
- "totalAmount" = final amount paid (after tax, tip, discounts)
- Detect currency: $ = USD, £ = GBP, € = EUR, ₹ = INR, S$ = SGD
- For ambiguous $ — use merchant address context
- Set confidence based on how well you can extract the key fields (merchant, total, date). 0.9+ = crystal clear, 0.5-0.8 = some fields unclear, below 0.2 = genuinely impossible to read
- Set isReadable = false ONLY if the image is so degraded that no meaningful text can be extracted at all
- Computer-generated, printed, or digital receipts should get HIGH confidence (0.8+) since text is clear
- Set fieldConfidence for each key field — 0.0 means not found, 1.0 means crystal clear`;

// ────────────────────────────────────────────────────────
// Self-correction prompt (Pass 2)
// ────────────────────────────────────────────────────────

function buildCorrectionPrompt(pass1Data) {
  return `You are a quality assurance auditor reviewing OCR output. Find and correct mistakes.

EXTRACTED DATA (from first OCR pass):
${JSON.stringify(pass1Data, null, 2)}

TASKS:
1. MATH CHECK: Do line items add up to subtotal? Does subtotal + tax - discount = total? Correct if wrong.
2. CHARACTER FIX: Common OCR errors: O↔0, l↔1, S↔5, B↔8, Z↔2, rn↔m.
3. DATE SANITY: Is date realistic? Not in future, not decades old?
4. CURRENCY LOGIC: Does currency match merchant location and amount scale?
5. CATEGORY CHECK: Does category match merchant? (Uber → Transport, Marriott → Lodging)

Return a JSON object:
{
  "corrected": { ... full corrected data with same schema as input ... },
  "corrections": [
    { "field": "fieldName", "old": "old value", "new": "new value", "reason": "why" }
  ],
  "mathValid": boolean,
  "mathDetails": "subtotal(X) + tax(Y) - discount(Z) = total(W) — correct/incorrect"
}

If everything is correct, return data unchanged with empty corrections array.`;
}

// ────────────────────────────────────────────────────────
// Cross-validation: Independent checks on extracted data
// (Catches hallucinations that slipped past the prompt)
// ────────────────────────────────────────────────────────

function crossValidateExtraction(data) {
  const flags = [];

  // CHECK 1: Line items sum vs totalAmount
  if (data.lineItems?.length > 0 && data.totalAmount) {
    const itemsSum = data.lineItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    if (itemsSum > 0) {
      const diff = Math.abs(itemsSum - (data.subtotal || data.totalAmount));
      const tolerance = Math.max(data.totalAmount * 0.05, 2); // 5% or $2/₹2
      if (diff > tolerance) {
        flags.push({
          check: 'lineItemsMismatch',
          severity: 'warn',
          message: `Line items sum (${itemsSum.toFixed(2)}) differs from ${data.subtotal ? 'subtotal' : 'total'} (${(data.subtotal || data.totalAmount).toFixed(2)}) by ${diff.toFixed(2)}`,
          expected: data.subtotal || data.totalAmount,
          actual: itemsSum,
        });
      }
    }
  }

  // CHECK 2: Date sanity — not in future, not older than 2 years
  if (data.date) {
    const receiptDate = new Date(data.date);
    const now = new Date();
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    if (receiptDate > now) {
      flags.push({
        check: 'futureDate',
        severity: 'error',
        message: `Receipt date ${data.date} is in the future — likely hallucinated or misread`,
      });
    } else if (receiptDate < twoYearsAgo) {
      flags.push({
        check: 'ancientDate',
        severity: 'warn',
        message: `Receipt date ${data.date} is over 2 years old — verify this is correct`,
      });
    }
  }

  // CHECK 3: Amount range sanity
  if (data.totalAmount != null) {
    if (data.totalAmount <= 0) {
      flags.push({
        check: 'zeroOrNegativeAmount',
        severity: 'error',
        message: `Total amount is ${data.totalAmount} — invalid for an expense claim`,
      });
    } else if (data.totalAmount > 10000000) { // >1 crore / $100k
      flags.push({
        check: 'extremelyHighAmount',
        severity: 'error',
        message: `Total amount ₹${data.totalAmount.toLocaleString()} seems unrealistically high — possible OCR error`,
      });
    }
  }

  // CHECK 4: Per-field confidence gating
  if (data.fieldConfidence) {
    const LOW_CONF_THRESHOLD = 0.4;
    const fieldsToCheck = ['merchantName', 'totalAmount', 'date', 'currency'];
    for (const field of fieldsToCheck) {
      const conf = data.fieldConfidence[field];
      if (conf != null && conf < LOW_CONF_THRESHOLD && data[field] != null) {
        flags.push({
          check: `lowConfidence_${field}`,
          severity: 'warn',
          message: `${field} value "${data[field]}" has low confidence (${Math.round(conf * 100)}%) — may be inaccurate`,
          fieldConfidence: conf,
        });
      }
    }
  }

  // CHECK 5: Currency-amount scale consistency
  if (data.currency && data.totalAmount) {
    const highValueCurrencies = { USD: 50000, EUR: 50000, GBP: 50000, SGD: 70000, AED: 180000 };
    const lowValueCurrencies = { INR: 10 }; // ₹10 minimum for a valid receipt

    const maxReasonable = highValueCurrencies[data.currency];
    if (maxReasonable && data.totalAmount > maxReasonable) {
      flags.push({
        check: 'currencyScaleMismatch',
        severity: 'warn',
        message: `${data.currency} ${data.totalAmount} is unusually high — check if currency is correct (maybe INR?)`,
      });
    }

    const minReasonable = lowValueCurrencies[data.currency];
    if (minReasonable && data.totalAmount < minReasonable) {
      flags.push({
        check: 'suspiciouslyLowAmount',
        severity: 'warn',
        message: `${data.currency} ${data.totalAmount} seems too low for a receipt`,
      });
    }
  }

  return flags;
}

// ────────────────────────────────────────────────────────
// Core: Run unified extraction on a preprocessed image
// ────────────────────────────────────────────────────────

async function runExtractionPass(imagePath, limiter) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).substring(1).toLowerCase();
  const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const imagePayload = { inlineData: { mimeType, data: base64Image } };

  const result = await limiter.generateContentWithImage(imagePayload, UNIFIED_PROMPT);
  const text = result.response.text().trim();
  const parsed = safeParseJSON(text);

  if (!parsed) {
    return { confidence: 0, isReadable: false, issues: 'OCR output malformed', rawText: text, classification: { isReceipt: true, documentType: 'unknown' } };
  }

  // Normalize totalAmount
  if (!parsed.totalAmount && parsed.amount) parsed.totalAmount = parsed.amount;

  return { ...parsed, rawText: text };
}

// ────────────────────────────────────────────────────────
// Main extraction pipeline
// ────────────────────────────────────────────────────────

/**
 * Extracts receipt data using an optimized multi-pass pipeline:
 *   Pass 1: UNIFIED classification + deep extraction (merged — saves ~7s)
 *   Pass 1b: Adaptive retry if confidence < 0.7
 *   Pass 2: Self-correction (SKIPPED if confidence ≥ 0.9 — saves ~7s)
 */
async function extractReceiptData(imagePath) {
  const startTime = Date.now();
  const limiter = getGeminiLimiter();

  // Check OCR cache first
  const imageHash = hashImage(imagePath);
  const cached = limiter.getCachedOCR(imageHash);
  if (cached) {
    return { ...cached, processingMs: Date.now() - startTime, fromCache: true };
  }

  try {
    // ═══ PASS 1: Unified Classification + Extraction (single API call) ═══
    let pass1Data = await runExtractionPass(imagePath, limiter);
    let usedPipeline = 'standard';

    // Check classification result
    const classification = pass1Data.classification || { isReceipt: true, documentType: 'unknown' };

    if (!classification.isReceipt) {
      return {
        merchantName: null, date: null, amount: null, currency: null,
        category: 'Other', confidence: 0, isReadable: false,
        isReceipt: false, documentType: classification.documentType,
        classificationReason: classification.reason,
        issues: `Not a valid receipt — detected as "${classification.documentType}": ${classification.reason}`,
        lineItems: [], taxBreakdown: null, corrections: [],
        processingMs: Date.now() - startTime,
      };
    }

    // ═══ PASS 1b: Adaptive Retry (only if confidence < threshold) ═══
    if ((pass1Data.confidence || 0) < ADAPTIVE_RETRY_THRESHOLD && pass1Data.confidence > 0) {
      console.log(`[ocrService] 🔄 Confidence ${Math.round(pass1Data.confidence * 100)}% < ${ADAPTIVE_RETRY_THRESHOLD * 100}% — adaptive retry`);

      let bestResult = pass1Data;
      let bestConfidence = pass1Data.confidence || 0;

      for (const pipelineName of RETRY_PIPELINES) {
        try {
          const originalPath = imagePath.replace(/_processed\.[^.]+$/, path.extname(imagePath))
            .replace(/_enhanced\.[^.]+$/, path.extname(imagePath))
            .replace(/_binarized\.[^.]+$/, path.extname(imagePath));
          const source = fs.existsSync(originalPath) ? originalPath : imagePath;
          const { processedPath } = await preprocessImage(source, pipelineName);

          const retryResult = await runExtractionPass(processedPath, limiter);
          const retryConf = retryResult.confidence || 0;

          console.log(`[ocrService]   ${pipelineName}: ${Math.round(retryConf * 100)}%${retryConf > bestConfidence ? ' ✓ BETTER' : ''}`);

          if (retryConf > bestConfidence) {
            bestResult = retryResult;
            bestConfidence = retryConf;
            usedPipeline = pipelineName;
          }
          if (bestConfidence >= 0.85) break;
        } catch (err) {
          console.warn(`[ocrService]   ${pipelineName}: failed — ${err.message}`);
        }
      }
      pass1Data = bestResult;
    }

    // ═══ PASS 2: Self-Correction (SKIPPED for high confidence — saves ~7s) ═══
    let finalData = pass1Data;
    let corrections = [];
    let mathValid = null;
    let mathDetails = null;

    const conf = pass1Data.confidence || 0;

    if (conf >= SKIP_CORRECTION_THRESHOLD) {
      // High confidence — skip correction pass entirely
      console.log(`[ocrService] ⚡ Confidence ${Math.round(conf * 100)}% ≥ ${SKIP_CORRECTION_THRESHOLD * 100}% — skipping correction pass`);

      // Still do a quick local math check (no API call needed)
      if (pass1Data.subtotal && pass1Data.totalAmount) {
        const computed = (pass1Data.subtotal || 0) + (pass1Data.taxAmount || 0) + (pass1Data.tipAmount || 0)
          + (pass1Data.serviceCharge || 0) - (pass1Data.discountAmount || 0);
        const diff = Math.abs(computed - pass1Data.totalAmount);
        mathValid = diff < 1; // within $1/₹1 tolerance
        mathDetails = `subtotal(${pass1Data.subtotal}) + tax(${pass1Data.taxAmount || 0}) + tip(${pass1Data.tipAmount || 0}) - discount(${pass1Data.discountAmount || 0}) = ${computed} vs total(${pass1Data.totalAmount}) — ${mathValid ? 'correct' : 'mismatch by ' + diff.toFixed(2)}`;
      }
    } else if (conf >= 0.4) {
      // Medium confidence — run full correction pass
      try {
        const correctionPrompt = buildCorrectionPrompt(pass1Data);
        const pass2Result = await limiter.generateContent(correctionPrompt);
        const pass2Text = pass2Result.response.text().trim();
        const pass2Data = safeParseJSON(pass2Text);

        if (pass2Data?.corrected) {
          finalData = pass2Data.corrected;
          corrections = pass2Data.corrections || [];
          mathValid = pass2Data.mathValid;
          mathDetails = pass2Data.mathDetails;

          if (corrections.length > 0) {
            console.log(`[ocrService] Pass 2: ${corrections.length} correction(s):`,
              corrections.map(c => `${c.field}: "${c.old}" → "${c.new}"`).join(', '));
          }
        }
      } catch (err) {
        console.warn('[ocrService] Pass 2 correction failed:', err.message);
      }
    }

    // ═══ CROSS-VALIDATION CHECKS (catches hallucinated data) ═══
    const validationFlags = crossValidateExtraction(finalData);
    if (validationFlags.length > 0) {
      console.log(`[ocrService] ⚠ Cross-validation: ${validationFlags.length} issue(s):`, validationFlags.map(f => f.check).join(', '));
    }

    // ═══ Build Final Result ═══
    const ocrResult = {
      merchantName: finalData.merchantName,
      merchantAddress: finalData.merchantAddress || null,
      date: finalData.date,
      time: finalData.time || null,
      amount: finalData.totalAmount || finalData.amount,
      currency: finalData.currency,
      category: finalData.category || 'Other',
      confidence: finalData.confidence,
      isReadable: finalData.isReadable !== false,
      issues: finalData.issues || null,
      rawText: pass1Data.rawText,

      isReceipt: classification.isReceipt,
      documentType: classification.documentType,
      classificationReason: classification.reason,

      // Per-field confidence from the AI (new)
      fieldConfidence: finalData.fieldConfidence || null,

      lineItems: (finalData.lineItems || []).map(item => ({
        description: item.description,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice || (item.unitPrice * (item.quantity || 1)),
      })),

      taxBreakdown: {
        subtotal: finalData.subtotal || null,
        taxAmount: finalData.taxAmount || null,
        taxPercent: finalData.taxPercent || null,
        tipAmount: finalData.tipAmount || null,
        discountAmount: finalData.discountAmount || null,
        serviceCharge: finalData.serviceCharge || null,
        total: finalData.totalAmount || finalData.amount || null,
        mathValid, mathDetails,
      },

      // Cross-validation results (new)
      validationFlags,
      validationPassed: validationFlags.filter(f => f.severity === 'error').length === 0,

      corrections,
      correctionCount: corrections.length,
      paymentMethod: finalData.paymentMethod || 'unknown',
      preprocessingPipeline: usedPipeline,

      processingMs: Date.now() - startTime,
    };

    limiter.setCachedOCR(imageHash, ocrResult);
    return ocrResult;

  } catch (error) {
    console.error('[ocrService] Pipeline error:', error.message);
    return {
      merchantName: null, date: null, amount: null, currency: null,
      category: 'Other', confidence: 0, isReadable: false, isReceipt: null,
      issues: `OCR processing failed: ${error.message}`,
      lineItems: [], taxBreakdown: null, corrections: [],
      processingMs: Date.now() - startTime,
    };
  }
}

/**
 * Validates that claimedDate matches the receipt date (within 1 day tolerance)
 */
function validateDateMatch(extractedDate, claimedDate, claimedDateEnd) {
  if (!extractedDate) return { match: null, message: 'Could not extract date from receipt' };
  const receipt = new Date(extractedDate);

  // If we have a date range (batch/trip upload), check if receipt falls within range
  if (claimedDateEnd) {
    const rangeStart = new Date(claimedDate);
    const rangeEnd = new Date(claimedDateEnd);
    // Allow 1 day buffer on each side
    rangeStart.setDate(rangeStart.getDate() - 1);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
    const inRange = receipt >= rangeStart && receipt <= rangeEnd;
    return {
      match: inRange,
      message: inRange
        ? 'Receipt date falls within trip date range'
        : `Receipt date (${extractedDate}) is outside trip dates`,
    };
  }

  // Single date comparison (standard upload)
  const claimed = new Date(claimedDate);
  const diffDays = Math.abs((receipt - claimed) / (1000 * 60 * 60 * 24));
  return {
    match: diffDays <= 1,
    diffDays,
    message: diffDays > 1
      ? `Receipt date (${extractedDate}) doesn't match claimed date (${claimedDate.toISOString().split('T')[0]})`
      : 'Dates match',
  };
}

module.exports = { extractReceiptData, validateDateMatch };
