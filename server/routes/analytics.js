const router = require('express').Router();
const Claim = require('../models/Claim');
const User = require('../models/User');
const { protect, requireRole } = require('../middleware/auth');

// GET /api/analytics/overview — High-level stats for auditor overview page
router.get('/overview', protect, requireRole('auditor', 'admin'), async (req, res) => {
  const { range = '30' } = req.query; // 7, 30, 90, all
  const baseFilter = { isDeleted: { $ne: true } };
  let rangeFilter = {};

  if (range !== 'all') {
    const days = parseInt(range) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    rangeFilter = { createdAt: { $gte: since } };
  }

  const filter = { ...baseFilter, ...rangeFilter };

  const [totalClaims, statusBreakdown, categoryBreakdown, totalSpend, monthlyTrend, avgProcessing] = await Promise.all([
    Claim.countDocuments(filter),
    Claim.aggregate([{ $match: filter }, { $group: { _id: '$auditStatus', count: { $sum: 1 } } }]),
    Claim.aggregate([{ $match: filter }, { $group: { _id: '$extractedData.category', count: { $sum: 1 }, totalAmount: { $sum: '$extractedData.amountUSD' } } }]),
    Claim.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$extractedData.amountUSD' } } }]),
    Claim.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          amount: { $sum: '$extractedData.amountUSD' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Claim.aggregate([
      { $match: { ...filter, processingDurationMs: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$processingDurationMs' } } },
    ]),
  ]);

  res.json({
    totalClaims,
    totalSpendUSD: totalSpend[0]?.total || 0,
    byStatus: statusBreakdown.reduce((a, { _id, count }) => ({ ...a, [_id]: count }), {}),
    byCategory: categoryBreakdown,
    monthlyTrend,
    avgProcessingMs: Math.round(avgProcessing[0]?.avg || 0),
  });
});

// GET /api/analytics/top-offenders — Employees with most flagged/rejected claims
router.get('/top-offenders', protect, requireRole('auditor', 'admin'), async (req, res) => {
  const offenders = await Claim.aggregate([
    { $match: { isDeleted: { $ne: true }, auditStatus: { $in: ['flagged', 'rejected'] } } },
    { $group: { _id: '$employee', flagged: { $sum: 1 }, totalAmount: { $sum: '$extractedData.amountUSD' } } },
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
        totalAmount: { $sum: '$extractedData.amountUSD' },
        approved: { $sum: { $cond: [{ $eq: ['$auditStatus', 'approved'] }, 1, 0] } },
      },
    },
  ]);
  const user = await User.findById(req.user._id).select('complianceScore totalClaims approvedClaims');
  res.json({ categoryBreakdown: myClaims, complianceScore: user.complianceScore });
});

module.exports = router;
