const fs = require('fs');
const crypto = require('crypto');
const Claim = require('../models/Claim');

/**
 * Compute a simple hash of the file buffer for duplicate detection.
 * For images we use MD5 of the raw file bytes.
 * A perceptual hash library (sharp-phash) can be added later for rotation-resistant matching.
 */
async function computeHash(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(buffer).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Check if a claim with the same image hash already exists.
 * Excludes the submitting employee's own previous claim for the same hash
 * to flag cross-employee duplicate submission (same receipt submitted by two people).
 */
async function findDuplicate(imageHash, employeeId) {
  if (!imageHash) return { isDuplicate: false };

  const existing = await Claim.findOne({
    imageHash,
    employee: { $ne: employeeId },  // from a different employee
  }).select('_id employee createdAt').lean();

  if (existing) {
    return { isDuplicate: true, originalClaimId: existing._id, originalSubmittedAt: existing.createdAt };
  }

  // Also check same employee submitting twice
  const selfDuplicate = await Claim.findOne({
    imageHash,
    employee: employeeId,
  }).select('_id createdAt').lean();

  if (selfDuplicate) {
    return { isDuplicate: true, isSelfDuplicate: true, originalClaimId: selfDuplicate._id };
  }

  return { isDuplicate: false };
}

module.exports = { computeHash, findDuplicate };
