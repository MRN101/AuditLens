const router = require('express').Router();
const Claim = require('../models/Claim');
const User = require('../models/User');
const { protect, requireRole } = require('../middleware/auth');

const BASE_CURRENCY = process.env.BASE_CURRENCY || 'INR';
const BASE_SYMBOL = process.env.BASE_CURRENCY_SYMBOL || '₹';

// GET /api/analytics/overview — High-level stats for auditor overview page
router.get('/overview', protect, requireRole('auditor', 'admin'), async (req, res) => {
  const { range = '30' } = req.query;
  const baseFilter = { isDeleted: { $ne: true } };
  let rangeFilter = {};

  if (range !== 'all') {
    const days = parseInt(range) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    rangeFilter = { createdAt: { $gte: since } };
  }

  const filter = { ...baseFilter, ...rangeFilter };

  const [totalClaims, statusBreakdown, categoryBreakdown, totalSpend, monthlyTrend, avgProcessing, tripTypeBreakdown] = await Promise.all([
    Claim.countDocuments(filter),
    Claim.aggregate([{ $match: filter }, { $group: { _id: '$auditStatus', count: { $sum: 1 } } }]),
    Claim.aggregate([{ $match: filter }, { $group: { _id: '$extractedData.category', count: { $sum: 1 }, totalAmount: { $sum: '$extractedData.amountBase' } } }]),
    Claim.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$extractedData.amountBase' } } }]),
    Claim.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          amount: { $sum: '$extractedData.amountBase' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Claim.aggregate([
      { $match: { ...filter, processingDurationMs: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$processingDurationMs' } } },
    ]),
    Claim.aggregate([
      { $match: filter },
      { $group: { _id: '$tripType', count: { $sum: 1 }, totalAmount: { $sum: '$extractedData.amountBase' } } },
    ]),
  ]);

  res.json({
    totalClaims,
    totalSpend: totalSpend[0]?.total || 0,
    baseCurrency: BASE_CURRENCY,
    baseSymbol: BASE_SYMBOL,
    byStatus: statusBreakdown.reduce((a, { _id, count }) => ({ ...a, [_id]: count }), {}),
    byCategory: categoryBreakdown,
    byTripType: tripTypeBreakdown,
    monthlyTrend,
    avgProcessingMs: Math.round(avgProcessing[0]?.avg || 0),
  });
});

// GET /api/analytics/top-offenders — Employees with most flagged/rejected claims
router.get('/top-offenders', protect, requireRole('auditor', 'admin'), async (req, res) => {
  const offenders = await Claim.aggregate([
    { $match: { isDeleted: { $ne: true }, auditStatus: { $in: ['flagged', 'rejected'] } } },
    { $group: { _id: '$employee', flagged: { $sum: 1 }, totalAmount: { $sum: '$extractedData.amountBase' } } },
    { $sort: { flagged: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'employee',
      },
    },
    { $unwind: '$employee' },
    {
      $project: {
        name: '$employee.name',
        email: '$employee.email',
        department: '$employee.department',
        complianceScore: '$employee.complianceScore',
        flaggedCount: '$flagged',
        totalAmount: 1,
      },
    },
  ]);
  res.json(offenders);
});

// GET /api/analytics/my — Employee's own spending analytics
router.get('/my', protect, async (req, res) => {
  const myClaims = await Claim.aggregate([
    { $match: { employee: req.user._id, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: '$extractedData.category',
        count: { $sum: 1 },
        totalAmount: { $sum: '$extractedData.amountBase' },
        approved: { $sum: { $cond: [{ $eq: ['$auditStatus', 'approved'] }, 1, 0] } },
      },
    },
  ]);

  const tripTypeBreakdown = await Claim.aggregate([
    { $match: { employee: req.user._id, isDeleted: { $ne: true } } },
    { $group: { _id: '$tripType', count: { $sum: 1 }, totalAmount: { $sum: '$extractedData.amountBase' } } },
  ]);

  const monthlyTrend = await Claim.aggregate([
    { $match: { employee: req.user._id, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        count: { $sum: 1 },
        amount: { $sum: '$extractedData.amountBase' },
      },
    },
    { $sort: { _id: -1 } },
    { $limit: 6 },
  ]);

  const user = await User.findById(req.user._id).select('complianceScore totalClaims approvedClaims');
  res.json({
    categoryBreakdown: myClaims,
    tripTypeBreakdown,
    monthlyTrend,
    complianceScore: user.complianceScore,
    totalClaims: user.totalClaims,
    approvedClaims: user.approvedClaims,
    baseCurrency: BASE_CURRENCY,
    baseSymbol: BASE_SYMBOL,
  });
});

module.exports = router;
