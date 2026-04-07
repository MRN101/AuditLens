const sharp = require('sharp');
const path = require('path');

/**
 * Preprocess a receipt image for optimal OCR extraction.
 *
 * Pipeline "standard" (default):
 *   - Auto-rotate via EXIF
 *   - Resize to 2000px max
 *   - Sharpen + normalize contrast
 *
 * Pipeline "enhanced" (for low-confidence retries):
 *   - Grayscale conversion
 *   - Higher contrast normalization
 *   - Stronger sharpening
 *   - Slight over-exposure to handle shadows
 *
 * Pipeline "binarized" (for very poor images):
 *   - Grayscale + threshold to pure B/W
 *   - Maximum contrast
 */

const PIPELINES = {
  standard: {
    name: 'standard',
    apply: (pipe) => pipe
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .sharpen({ sigma: 1.5, m1: 0.5, m2: 3.0 })
      .normalise(),
  },
  enhanced: {
    name: 'enhanced',
    apply: (pipe) => pipe
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .sharpen({ sigma: 2.0, m1: 1.0, m2: 5.0 })
      .normalise()
      .linear(1.3, 10), // boost contrast + slight brightness
  },
  binarized: {
    name: 'binarized',
    apply: (pipe) => pipe
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .normalise()
      .sharpen({ sigma: 2.5, m1: 1.5, m2: 6.0 })
      .threshold(140), // convert to pure B/W
  },
};

/**
 * @param {string} imagePath - Original image path
 * @param {string} pipelineName - 'standard' | 'enhanced' | 'binarized'
 * @returns {{ processedPath, thumbnailPath, metadata, pipeline }}
 */
async function preprocessImage(imagePath, pipelineName = 'standard') {
  const ext = path.extname(imagePath).toLowerCase();

  // Skip for PDFs
  if (ext === '.pdf') {
    return { processedPath: imagePath, thumbnailPath: null, metadata: { skipped: true, reason: 'PDF' }, pipeline: 'none' };
  }

  const pipeline = PIPELINES[pipelineName] || PIPELINES.standard;
  const dir = path.dirname(imagePath);
  const basename = path.basename(imagePath, ext);
  const suffix = pipelineName === 'standard' ? '_processed' : `_${pipelineName}`;
  const processedPath = path.join(dir, `${basename}${suffix}${ext}`);
  const thumbnailPath = path.join(dir, `${basename}_thumb.webp`);

  try {
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    // Apply the selected pipeline
    await pipeline.apply(sharp(imagePath)).toFile(processedPath);

    // Generate thumbnail (only on first pipeline — standard)
    if (pipelineName === 'standard') {
      await sharp(imagePath)
        .rotate()
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(thumbnailPath);
    }

    return {
      processedPath,
      thumbnailPath: pipelineName === 'standard' ? `/uploads/${path.basename(thumbnailPath)}` : null,
      metadata: {
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        format: metadata.format,
        size: metadata.size,
        hasExif: !!metadata.exif,
      },
      pipeline: pipeline.name,
    };
  } catch (err) {
    console.warn(`[imagePreprocessor] ${pipeline.name} pipeline failed, using original:`, err.message);
    return { processedPath: imagePath, thumbnailPath: null, metadata: { error: err.message }, pipeline: 'fallback' };
  }
}

/** List of fallback pipelines for adaptive retry */
const RETRY_PIPELINES = ['enhanced', 'binarized'];

module.exports = { preprocessImage, RETRY_PIPELINES, PIPELINES };
