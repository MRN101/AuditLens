const router = require('express').Router();
const Claim = require('../models/Claim');
const { protect } = require('../middleware/auth');

const BASE_CURRENCY = process.env.BASE_CURRENCY || 'INR';
const BASE_SYMBOL = process.env.BASE_CURRENCY_SYMBOL || '₹';

// Default budget limits per category per month (in base currency)
// These can be overridden by policy engine in the future
const DEFAULT_LIMITS = {
  Meals: { domestic: 5000, international: 15000 },
  Transport: { domestic: 8000, international: 25000 },
  Lodging: { domestic: 15000, international: 50000 },
  Entertainment: { domestic: 3000, international: 10000 },
  'Office Supplies': { domestic: 5000, international: 5000 },
  Other: { domestic: 3000, international: 8000 },
};

/**
 * GET /api/budget/my — Get current month spending vs limits per category
 */
router.get('/my', protect, async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Aggregate spending by category for current month
  const spending = await Claim.aggregate([
    {
      $match: {
        employee: req.user._id,
        isDeleted: { $ne: true },
        auditStatus: { $in: ['approved', 'pending', 'processing', 'flagged'] },
        createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      },
    },
    {
      $group: {
        _id: '$extractedData.category',
        totalSpent: { $sum: '$extractedData.amountBase' },
        count: { $sum: 1 },
        tripTypes: { $addToSet: '$tripType' },
      },
    },
  ]);

  // Build budget response with limits
  const seniority = req.user.seniority || 'mid';
  const seniorityMultiplier = { junior: 0.8, mid: 1.0, senior: 1.3, executive: 2.0 }[seniority] || 1.0;

  const categories = Object.keys(DEFAULT_LIMITS);
  const budget = categories.map(cat => {
    const spent = spending.find(s => s._id === cat);
    const hasInternational = spent?.tripTypes?.includes('international');
    const limitType = hasInternational ? 'international' : 'domestic';
    const baseLimit = DEFAULT_LIMITS[cat]?.[limitType] || 5000;
    const limit = Math.round(baseLimit * seniorityMultiplier);
    const totalSpent = Math.round(spent?.totalSpent || 0);
    const remaining = Math.max(0, limit - totalSpent);
    const percentage = limit > 0 ? Math.min(100, Math.round((totalSpent / limit) * 100)) : 0;

    return {
      category: cat,
      spent: totalSpent,
      limit,
      remaining,
      percentage,
      count: spent?.count || 0,
      status: percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'ok',
      currency: BASE_CURRENCY,
      symbol: BASE_SYMBOL,
    };
  });

  const totalSpent = budget.reduce((s, b) => s + b.spent, 0);
  const totalLimit = budget.reduce((s, b) => s + b.limit, 0);

  res.json({
    budget,
    summary: {
      totalSpent,
      totalLimit,
      remaining: totalLimit - totalSpent,
      percentage: totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0,
      month: now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
      seniority,
      currency: BASE_CURRENCY,
      symbol: BASE_SYMBOL,
    },
    daysRemaining: Math.ceil((endOfMonth - now) / (1000 * 60 * 60 * 24)),
  });
});

module.exports = router;
