const router = require('express').Router();
const axios = require('axios');
const { protect } = require('../middleware/auth');
const { getGeminiLimiter } = require('../services/geminiRateLimiter');

// In-memory FAQ cache — pre-computed answers
const faqCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Per-user rate limit tracking
const userCalls = new Map();
const MAX_CALLS_PER_HOUR = 15;

function checkUserRateLimit(userId) {
  const key = userId.toString();
  const now = Date.now();
  const userRecord = userCalls.get(key) || { count: 0, resetAt: now + 3600000 };
  if (now > userRecord.resetAt) {
    userRecord.count = 0;
    userRecord.resetAt = now + 3600000;
  }
  if (userRecord.count >= MAX_CALLS_PER_HOUR) return false;
  userRecord.count++;
  userCalls.set(key, userRecord);
  return true;
}

/**
 * POST /api/chatbot/ask — Ask a natural-language question about company policy
 */
router.post('/ask', protect, async (req, res) => {
  const { question } = req.body;
  if (!question || question.trim().length < 3) {
    return res.status(400).json({ message: 'Question must be at least 3 characters' });
  }

  // Rate limit per user
  if (!checkUserRateLimit(req.user._id)) {
    return res.status(429).json({ message: 'You\'ve reached the chatbot limit (15 questions/hour). Please try again later.' });
  }

  // Check FAQ cache with fuzzy matching (lowercase, trimmed)
  const cacheKey = question.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const cached = faqCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json({ answer: cached.answer, sources: cached.sources, fromCache: true });
  }

  try {
    // 1. Query vector store for relevant policy chunks
    const engineUrl = process.env.POLICY_ENGINE_URL || 'http://localhost:8000';
    let policyChunks = [];
    try {
      const policyRes = await axios.post(`${engineUrl}/query`, {
        category: 'general',
        businessPurpose: question,
        location: req.user.location || 'default',
      }, { timeout: 10000 });
      policyChunks = policyRes.data.policyChunks || [];
    } catch {
      // Policy engine unavailable — still answer with general knowledge
    }

    // 2. Generate answer using Gemini (light model)
    const limiter = getGeminiLimiter();
    const prompt = `You are a helpful corporate expense policy assistant for an Indian company. Answer the employee's question based on the policy excerpts below.

EMPLOYEE:
- Name: ${req.user.name}
- Location: ${req.user.location || 'India'}
- Seniority: ${req.user.seniority || 'mid'}

RELEVANT POLICY EXCERPTS:
${policyChunks.length > 0 ? policyChunks.join('\n\n---\n\n') : 'No specific policy documents found. Use general corporate expense best practices for Indian companies.'}

EMPLOYEE QUESTION: "${question}"

RULES:
- Answer concisely and helpfully (2-4 sentences max)
- If the answer is in the policy excerpts, cite the specific section
- If you're not sure, say "I couldn't find a specific rule for this. Please check with your finance team."
- All amounts should be in INR (₹)
- Be friendly but professional

Return ONLY a valid JSON (no markdown):
{
  "answer": "Your helpful answer here",
  "sources": ["Brief description of source section 1"],
  "confidence": 0.0-1.0
}`;

    const result = await limiter.generateContent(prompt);
    const text = result.response.text().trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);

    // Cache the answer
    faqCache.set(cacheKey, { ...parsed, timestamp: Date.now() });

    res.json({ answer: parsed.answer, sources: parsed.sources || [], confidence: parsed.confidence });
  } catch (err) {
    console.error('[chatbot] Error:', err.message);
    res.status(500).json({ message: 'Chatbot is temporarily unavailable. Please try again.' });
  }
});

/**
 * GET /api/chatbot/suggested — Get suggested questions
 */
router.get('/suggested', protect, (req, res) => {
  const suggestions = [
    'What is the daily meal allowance?',
    'Can I expense alcohol at a client dinner?',
    'What are the hotel booking limits for domestic travel?',
    'How do I claim international travel expenses?',
    'Are WiFi and internet expenses reimbursable?',
    'What receipts are required for transport claims?',
    'What is the maximum amount for office supplies?',
    'Can I claim weekend meal expenses during a business trip?',
  ];
  res.json(suggestions);
});

module.exports = router;
