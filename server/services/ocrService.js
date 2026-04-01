const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getGeminiLimiter } = require('./geminiRateLimiter');

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
 * Extracts receipt data from an image using Gemini Vision (multimodal).
 * Uses GeminiRateLimiter for queued, rate-safe calls with OCR caching.
 */
async function extractReceiptData(imagePath) {
  const startTime = Date.now();
  const limiter = getGeminiLimiter();

  // Check OCR cache first (same image = same result)
  const imageHash = hashImage(imagePath);
  const cached = limiter.getCachedOCR(imageHash);
  if (cached) {
    return { ...cached, processingMs: Date.now() - startTime };
  }

  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).substring(1).toLowerCase();
    const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    const prompt = `You are an expert receipt OCR system. Analyze this receipt/document and extract the following information.
    
Return ONLY a valid JSON object with these exact fields (no markdown, no extra text):
{
  "merchantName": "string or null",
  "date": "YYYY-MM-DD format or null",
  "amount": number or null,
  "currency": "3-letter ISO code (USD, GBP, EUR, INR etc.) or null",
  "category": "one of: Meals, Transport, Lodging, Entertainment, Office Supplies, Other",
  "confidence": number between 0 and 1,
  "isReadable": boolean,
  "issues": "string describing any problems or null"
}

Rules:
- If the image is blurry or unreadable, set isReadable to false and confidence below 0.4
- Extract the TOTAL amount (not subtotal)
- Detect currency from symbols ($ = USD, £ = GBP, € = EUR, ₹ = INR)
- Categorize based on merchant type`;

    const result = await limiter.generateContentWithImage(
      { inlineData: { mimeType, data: base64Image } },
      prompt
    );

    const text = result.response.text().trim();
    const jsonText = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const extracted = JSON.parse(jsonText);

    const ocrResult = {
      ...extracted,
      rawText: text,
      processingMs: Date.now() - startTime,
    };

    // Cache the successful result
    limiter.setCachedOCR(imageHash, ocrResult);

    return ocrResult;
  } catch (error) {
    console.error('[ocrService] Error:', error.message);
    return {
      merchantName: null,
      date: null,
      amount: null,
      currency: null,
      category: 'Other',
      confidence: 0,
      isReadable: false,
      issues: `OCR processing failed: ${error.message}`,
      processingMs: Date.now() - startTime,
    };
  }
}

/**
 * Validates that claimedDate matches the receipt date (within 1 day tolerance)
 */
function validateDateMatch(extractedDate, claimedDate) {
  if (!extractedDate) return { match: null, message: 'Could not extract date from receipt' };
  
  const receipt = new Date(extractedDate);
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
