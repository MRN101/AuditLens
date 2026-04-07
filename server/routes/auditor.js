const router = require('express').Router();
const Claim = require('../models/Claim');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { protect, requireRole } = require('../middleware/auth');
const { sendOverrideEmail } = require('../services/emailService');

// GET /api/auditor/claims — All claims sorted by risk for auditor dashboard
router.get('/claims', protect, requireRole('auditor', 'admin'), async (req, res) => {
  const { page = 1, limit = 20, status, riskLevel, search, tripType } = req.query;
  const filter = { isDeleted: { $ne: true } };
  if (status) filter.auditStatus = status;
  if (riskLevel) filter.riskLevel = riskLevel;
  if (tripType) filter.tripType = tripType;

  const riskOrder = { high: 0, medium: 1, low: 2 };

  // Text search on merchant name or business purpose
  if (search && search.trim()) {
    filter.$or = [
      { 'extractedData.merchantName': { $regex: search.trim(), $options: 'i' } },
      { businessPurpose: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  let claims = await Claim.find(filter)
    .populate('employee', 'name email location seniority department complianceScore')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .lean({ virtuals: true });

  // Filter by employee name if search is a name match
  if (search && search.trim()) {
    const nameRegex = new RegExp(search.trim(), 'i');
    claims = claims.filter(c =>
      nameRegex.test(c.employee?.name || '') ||
      nameRegex.test(c.extractedData?.merchantName || '') ||
      nameRegex.test(c.businessPurpose || '')
    );
  }

  // Sort by risk level (high first) then by date
  claims.sort((a, b) => (riskOrder[a.riskLevel] ?? 3) - (riskOrder[b.riskLevel] ?? 3));

  const total = await Claim.countDocuments(filter);
  res.json({ claims, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// PATCH /api/auditor/claims/:id/override — Human-in-the-loop override
router.patch('/claims/:id/override', protect, requireRole('auditor', 'admin'), async (req, res) => {
  const { status, comment } = req.body;
  if (!status || !comment) {
    return res.status(400).json({ message: 'status and comment are required' });
  }
  const validStatuses = ['approved', 'flagged', 'rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: `Status must be one of: ${validStatuses.join(', ')}` });
  }

  const claim = await Claim.findByIdAndUpdate(
    req.params.id,
    {
      auditStatus: status,
      auditorOverride: {
        isOverridden: true,
        overriddenStatus: status,
        comment,
        auditorId: req.user._id,
        overriddenAt: new Date(),
      },
    },
    { new: true }
  ).populate('employee', 'name email');

  if (!claim) return res.status(404).json({ message: 'Claim not found' });

  // Log override
  AuditLog.log(claim._id, req.user, 'overridden', `Status changed to ${status}: "${comment}"`, {
    previousStatus: claim.auditStatus, newStatus: status,
  });

  // Update employee compliance score correctly
  const employee = await User.findById(claim.employee._id);
  if (employee) {
    const allClaims = await Claim.find({
      employee: employee._id,
      auditStatus: { $in: ['approved', 'flagged', 'rejected'] },
      isDeleted: { $ne: true },
    }).lean();
    employee.totalClaims = allClaims.length;
    employee.approvedClaims = allClaims.filter(c =>
      (c.auditorOverride?.isOverridden ? c.auditorOverride.overriddenStatus : c.auditStatus) === 'approved'
    ).length;
    employee.updateComplianceScore();
    await employee.save();
  }

  // Emit real-time notification
  const io = req.app.get('io');
  if (io) {
    io.to(claim.employee._id.toString()).emit('claim_updated', {
      claimId: claim._id,
      newStatus: status,
      message: `Your claim has been reviewed: ${status.toUpperCase()}`,
    });
  }

  // Send email (fire-and-forget)
  sendOverrideEmail(claim.employee, claim, status, comment).catch(() => {});

  res.json({ message: 'Override applied', claim });
});

// POST /api/auditor/claims/bulk-override — Batch override
router.post('/claims/bulk-override', protect, requireRole('auditor', 'admin'), async (req, res) => {
  const { claimIds, status, comment } = req.body;
  if (!Array.isArray(claimIds) || !claimIds.length) {
    return res.status(400).json({ message: 'claimIds array is required' });
  }
  if (!status || !comment) {
    return res.status(400).json({ message: 'status and comment are required' });
  }

  const result = await Claim.updateMany(
    { _id: { $in: claimIds } },
    {
      auditStatus: status,
      auditorOverride: {
        isOverridden: true,
        overriddenStatus: status,
        comment,
        auditorId: req.user._id,
        overriddenAt: new Date(),
      },
    }
  );

  // Log each override
  for (const id of claimIds) {
    AuditLog.log(id, req.user, 'overridden', `Bulk override to ${status}: "${comment}"`);
  }

  const io = req.app.get('io');
  if (io) {
    const claims = await Claim.find({ _id: { $in: claimIds } }).select('employee');
    const employeeIds = [...new Set(claims.map(c => c.employee.toString()))];
    employeeIds.forEach(empId => {
      io.to(empId).emit('claim_updated', { message: `Multiple claims updated to: ${status.toUpperCase()}` });
    });
  }

  res.json({ message: `${result.modifiedCount} claims updated`, modifiedCount: result.modifiedCount });
});

// GET /api/auditor/stats — Dashboard summary stats
router.get('/stats', protect, requireRole('auditor', 'admin'), async (req, res) => {
  const baseFilter = { isDeleted: { $ne: true } };

  const [statusCounts, riskCounts, recentActivity, avgProcessing, tripTypeCounts] = await Promise.all([
    Claim.aggregate([{ $match: baseFilter }, { $group: { _id: '$auditStatus', count: { $sum: 1 } } }]),
    Claim.aggregate([{ $match: baseFilter }, { $group: { _id: '$riskLevel', count: { $sum: 1 } } }]),
    Claim.find({ ...baseFilter, auditStatus: { $ne: 'pending' } })
      .sort({ updatedAt: -1 })
      .limit(5)
      .populate('employee', 'name'),
    Claim.aggregate([
      { $match: { ...baseFilter, processingDurationMs: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$processingDurationMs' } } },
    ]),
    Claim.aggregate([{ $match: baseFilter }, { $group: { _id: '$tripType', count: { $sum: 1 }, totalAmount: { $sum: '$extractedData.amountBase' } } }]),
  ]);

  const toMap = (arr) => arr.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {});
  res.json({
    byStatus: toMap(statusCounts),
    byRisk: toMap(riskCounts),
    byTripType: tripTypeCounts,
    recentActivity,
    avgProcessingMs: Math.round(avgProcessing[0]?.avg || 0),
  });
});

// GET /api/auditor/employees — Employee compliance leaderboard
router.get('/employees', protect, requireRole('auditor', 'admin'), async (req, res) => {
  const employees = await User.find({ role: 'employee', isActive: true })
    .select('name email department complianceScore totalClaims approvedClaims lastLoginAt')
    .sort({ complianceScore: -1 });
  res.json(employees);
});

module.exports = router;
