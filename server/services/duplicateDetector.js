const crypto = require('crypto');
const fs = require('fs');
const Claim = require('../models/Claim');

/**
 * DuplicateDetector — Detects duplicate receipt submissions using:
 *   1. Exact hash match (MD5) — detects identical files
 *   2. Perceptual similarity — detects same receipt with different crops/quality
 *      Uses a simplified average-hash (aHash) via pixel intensity comparison
 *   3. Metadata match — detects same merchant+amount+date combo within 90 days
 */

/**
 * Compute MD5 hash of the raw image file.
 */
function computeExactHash(imagePath) {
  try {
    const buffer = fs.readFileSync(imagePath);
    return crypto.createHash('md5').update(buffer).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Compute a perceptual hash (average hash) using sharp.
 * Resizes to 8x8 greyscale, computes average, generates 64-bit binary hash.
 * Two images with hamming distance < 10 are likely the same receipt.
 */
async function computePerceptualHash(imagePath) {
  try {
    const sharp = require('sharp');
    const { data } = await sharp(imagePath)
      .resize(8, 8, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Compute average pixel value
    const pixels = Array.from(data);
    const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;

    // Build binary hash: 1 if pixel >= avg, 0 otherwise
    const bits = pixels.map(p => (p >= avg ? '1' : '0')).join('');
    
    // Convert to hex for compact storage
    let hex = '';
    for (let i = 0; i < bits.length; i += 4) {
      hex += parseInt(bits.substring(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch (err) {
    console.warn('[duplicateDetector] Perceptual hash failed:', err.message);
    return null;
  }
}

/**
 * Calculate hamming distance between two hex hashes.
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
    // Count set bits in xor
    distance += xor.toString(2).split('1').length - 1;
  }
  return distance;
}

/**
 * Check for duplicate receipts for a given employee.
 * Returns { isDuplicate, matchType, matchedClaimId, similarity }
 */
async function checkDuplicate(imagePath, employeeId, extractedData, currentClaimId, tripId) {
  const result = {
    isDuplicate: false,
    matchType: null,
    matchedClaimId: null,
    exactHash: null,
    perceptualHash: null,
    similarity: 0,
  };

  // 1. Compute hashes
  result.exactHash = computeExactHash(imagePath);
  result.perceptualHash = await computePerceptualHash(imagePath);

  // Base exclusion filter — always exclude deleted and current claim
  const baseExclude = { isDeleted: { $ne: true } };
  if (currentClaimId) baseExclude._id = { $ne: currentClaimId };
  if (tripId) baseExclude.tripId = { $ne: tripId };

  // 2. Check exact MD5 hash match against employee's existing claims
  if (result.exactHash) {
    const filter = {
      ...baseExclude,
      employee: employeeId,
      imageHash: result.exactHash,
    };

    const exactMatch = await Claim.findOne(filter).lean();

    if (exactMatch) {
      return {
        ...result,
        isDuplicate: true,
        matchType: 'exact',
        matchedClaimId: exactMatch._id,
        similarity: 100,
      };
    }
  }

  // 3. Check perceptual hash similarity
  if (result.perceptualHash) {
    const pFilter = {
      ...baseExclude,
      employee: employeeId,
      perceptualHash: { $exists: true, $ne: null },
      createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    };
    const recentClaims = await Claim.find(pFilter, 'perceptualHash').lean();

    for (const claim of recentClaims) {
      const distance = hammingDistance(result.perceptualHash, claim.perceptualHash);
      const similarity = Math.round((1 - distance / 64) * 100);

      if (distance <= 8) { // ~87% similar
        return {
          ...result,
          isDuplicate: true,
          matchType: 'perceptual',
          matchedClaimId: claim._id,
          similarity,
        };
      }
    }
  }

  // 4. Metadata match: same merchant + amount + date within 90 days
  if (extractedData?.merchantName && extractedData?.amount) {
    const mFilter = {
      ...baseExclude,
      employee: employeeId,
      'extractedData.merchantName': { $regex: new RegExp(extractedData.merchantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      'extractedData.amount': extractedData.amount,
      createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    };
    const metaMatch = await Claim.findOne(mFilter).lean();

    if (metaMatch) {
      // Check if dates also match
      if (extractedData.date && metaMatch.extractedData?.date) {
        const diff = Math.abs(new Date(extractedData.date) - new Date(metaMatch.extractedData.date));
        if (diff < 2 * 24 * 60 * 60 * 1000) { // Within 2 days
          return {
            ...result,
            isDuplicate: true,
            matchType: 'metadata',
            matchedClaimId: metaMatch._id,
            similarity: 95,
          };
        }
      }
    }
  }

  return result;
}

module.exports = { checkDuplicate, computeExactHash, computePerceptualHash, hammingDistance };
