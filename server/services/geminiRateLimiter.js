const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');

/**
 * GeminiRateLimiter — Centralized Gemini API manager with:
 *   1. Request queue with configurable spacing (prevents burst 429s)
 *   2. API key rotation (multiple free-tier keys = N× quota)
 *   3. Model fallback chain (each model has separate RPM quota)
 *   4. In-memory OCR result cache by image hash
 *   5. Smart retry with exponential backoff
 */
class GeminiRateLimiter {
  constructor() {
    // --- API Key Rotation ---
    // Support comma-separated keys: GEMINI_API_KEYS=key1,key2,key3
    // Falls back to single GEMINI_API_KEY if GEMINI_API_KEYS is not set
    const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    this.apiKeys = keysEnv.split(',').map(k => k.trim()).filter(Boolean);
    if (this.apiKeys.length === 0) {
      throw new Error('[GeminiRateLimiter] No API keys configured. Set GEMINI_API_KEY or GEMINI_API_KEYS.');
    }
    this.currentKeyIndex = 0;
    this.keyClients = this.apiKeys.map(key => new GoogleGenerativeAI(key));

    // --- Model Fallback Chain ---
    const primaryModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    this.modelChain = [
      primaryModel,
      ...['gemini-1.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash']
        .filter(m => m !== primaryModel),
    ];

    // --- Request Queue ---
    this.queue = [];
    this.processing = false;
    this.minIntervalMs = parseInt(process.env.GEMINI_MIN_INTERVAL_MS, 10) || 1500; // 1.5s between calls
    this.lastCallTime = 0;

    // --- OCR Cache (image hash → extracted data) ---
    this.ocrCache = new Map();
    this.maxCacheSize = 500;

    // --- Retry Config ---
    this.maxRetries = 4;

    console.log(`[GeminiRateLimiter] Initialized: ${this.apiKeys.length} key(s), models: [${this.modelChain.join(', ')}], spacing: ${this.minIntervalMs}ms`);
  }

  // ──────────────── API Key Rotation ────────────────

  /** Get the next API key client (round-robin) */
  _rotateKey() {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keyClients.length;
    return this.keyClients[this.currentKeyIndex];
  }

  /** Get current client without rotating */
  _currentClient() {
    return this.keyClients[this.currentKeyIndex];
  }

  // ──────────────── Request Queue ────────────────

  /**
   * Enqueue a Gemini API call. Resolves when the call completes.
   * Calls are processed sequentially with minimum spacing.
   * @param {Function} callFn - (client, modelName) => Promise<result>
   * @param {Object} opts - { useModelFallback: true, cacheKey: null }
   */
  async enqueue(callFn, opts = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ callFn, opts, resolve, reject });
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const { callFn, opts, resolve, reject } = this.queue.shift();

      // Enforce minimum spacing
      const elapsed = Date.now() - this.lastCallTime;
      if (elapsed < this.minIntervalMs) {
        await this._sleep(this.minIntervalMs - elapsed);
      }

      try {
        const result = await this._executeWithFallback(callFn, opts);
        this.lastCallTime = Date.now();
        resolve(result);
      } catch (err) {
        this.lastCallTime = Date.now();
        reject(err);
      }
    }

    this.processing = false;
  }

  /**
   * Execute a call with key rotation + model fallback + retry.
   */
  async _executeWithFallback(callFn, opts = {}) {
    const useModelFallback = opts.useModelFallback !== false;
    const models = useModelFallback ? this.modelChain : [this.modelChain[0]];

    let lastError = null;

    // Try each model in the fallback chain
    for (const modelName of models) {
      // Try each API key for this model
      for (let keyAttempt = 0; keyAttempt < this.apiKeys.length; keyAttempt++) {
        const client = this._currentClient();

        // Retry loop for transient errors
        for (let retry = 0; retry <= this.maxRetries; retry++) {
          try {
            const result = await callFn(client, modelName);
            return result;
          } catch (err) {
            lastError = err;
            const is429 = err.status === 429 || err.message?.includes('429') || err.message?.includes('Resource has been exhausted');
            const is503 = err.status === 503 || err.message?.includes('overloaded');
            const is404 = err.status === 404;

            // Model not found — skip to next model immediately
            if (is404) {
              console.warn(`[GeminiRateLimiter] Model ${modelName} not found, trying next...`);
              break; // break retry loop, continue model loop
            }

            // Rate limited — try rotating key first
            if (is429 && this.apiKeys.length > 1) {
              this._rotateKey();
              console.warn(`[GeminiRateLimiter] 429 on ${modelName}, rotated to key ${this.currentKeyIndex + 1}/${this.apiKeys.length}`);
              continue; // retry with new key
            }

            // Rate limited or overloaded — backoff and retry
            if ((is429 || is503) && retry < this.maxRetries) {
              const delay = this._getBackoffDelay(retry, err);
              console.warn(`[GeminiRateLimiter] ${is429 ? '429' : '503'} on ${modelName}, backoff ${(delay / 1000).toFixed(0)}s (retry ${retry + 1}/${this.maxRetries})`);
              await this._sleep(delay);
              continue;
            }

            // Non-retryable error — break retry, try next model
            if (!is429 && !is503) break;
          }
        }

        // If we exhausted retries for this key+model, try next key
        if (keyAttempt < this.apiKeys.length - 1) {
          this._rotateKey();
        }
      }
      // Model exhausted across all keys — try next model
      console.warn(`[GeminiRateLimiter] All keys exhausted for ${modelName}, trying next model...`);
    }

    // All models and keys exhausted
    throw lastError || new Error('[GeminiRateLimiter] All API keys and models exhausted');
  }

  /**
   * Smart backoff: parse retryDelay from error if available, otherwise exponential.
   */
  _getBackoffDelay(retry, err) {
    // Try to parse Google's suggested retry delay
    const msg = err.message || '';
    const match = msg.match(/retryDelay.*?(\d+)/);
    if (match) {
      return Math.max(parseInt(match[1], 10) * 1000 + 2000, 5000);
    }
    // Exponential backoff: 5s, 15s, 30s, 60s
    return [5000, 15000, 30000, 60000][retry] || 60000;
  }

  // ──────────────── OCR Cache ────────────────

  /**
   * Get cached OCR result by image file hash.
   * @param {string} imageHash - MD5 hash of the image file
   * @returns {Object|null} Cached OCR result or null
   */
  getCachedOCR(imageHash) {
    if (!imageHash) return null;
    const cached = this.ocrCache.get(imageHash);
    if (cached) {
      console.log(`[GeminiRateLimiter] OCR cache HIT for hash ${imageHash.substring(0, 8)}...`);
      return { ...cached, fromCache: true };
    }
    return null;
  }

  /**
   * Cache an OCR result by image hash.
   * @param {string} imageHash - MD5 hash of the image
   * @param {Object} result - OCR extraction result to cache
   */
  setCachedOCR(imageHash, result) {
    if (!imageHash || !result) return;
    // Don't cache failed / unreadable results — they may be transient API failures
    if (!result.isReadable || (result.confidence != null && result.confidence < 0.3)) {
      console.log(`[GeminiRateLimiter] OCR cache SKIP for hash ${imageHash.substring(0, 8)}... (low quality result, conf: ${result.confidence})`);
      return;
    }
    // Evict oldest entries if cache is full
    if (this.ocrCache.size >= this.maxCacheSize) {
      const firstKey = this.ocrCache.keys().next().value;
      this.ocrCache.delete(firstKey);
    }
    this.ocrCache.set(imageHash, { ...result, cachedAt: Date.now() });
    console.log(`[GeminiRateLimiter] OCR cache SET for hash ${imageHash.substring(0, 8)}... (${this.ocrCache.size} entries)`);
  }

  // ──────────────── Convenience Methods ────────────────

  /**
   * Generate text content (for LLM audit prompts).
   * Automatically handles queue, rotation, fallback, and retry.
   */
  async generateContent(prompt, opts = {}) {
    return this.enqueue((client, modelName) => {
      const config = { model: modelName };
      const genCfg = { temperature: 0 };
      if (opts.jsonMode !== false) {
        genCfg.responseMimeType = 'application/json';
      }
      config.generationConfig = genCfg;
      const model = client.getGenerativeModel(config);
      return model.generateContent(prompt);
    }, { useModelFallback: true });
  }

  /**
   * Generate content with image (for OCR / multimodal).
   * Automatically handles queue, rotation, fallback, and retry.
   */
  async generateContentWithImage(imageData, prompt, opts = {}) {
    return this.enqueue((client, modelName) => {
      const config = { model: modelName };
      const genCfg = { temperature: 0 };
      if (opts.jsonMode !== false) {
        genCfg.responseMimeType = 'application/json';
      }
      config.generationConfig = genCfg;
      const model = client.getGenerativeModel(config);
      return model.generateContent([imageData, prompt]);
    }, { useModelFallback: true });
  }

  /** Get stats for health check / monitoring */
  getStats() {
    return {
      apiKeys: this.apiKeys.length,
      currentKeyIndex: this.currentKeyIndex,
      modelChain: this.modelChain,
      queueLength: this.queue.length,
      cacheSize: this.ocrCache.size,
      minIntervalMs: this.minIntervalMs,
    };
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

// Singleton instance
let instance = null;

function getGeminiLimiter() {
  if (!instance) {
    instance = new GeminiRateLimiter();
  }
  return instance;
}

module.exports = { getGeminiLimiter, GeminiRateLimiter };
