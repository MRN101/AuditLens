const router = require('express').Router();
const AuditLog = require('../models/AuditLog');
const { protect, requireRole } = require('../middleware/auth');

// GET /api/auditlog/:claimId — Get full audit trail for a claim
router.get('/:claimId', protect, async (req, res) => {
  const logs = await AuditLog.find({ claim: req.params.claimId })
    .sort({ timestamp: -1 })
    .limit(50)
    .lean();
  res.json(logs);
});

// GET /api/auditlog — Get recent activity feed (auditor/admin only)
router.get('/', protect, requireRole('auditor', 'admin'), async (req, res) => {
  const { limit = 30 } = req.query;
  const logs = await AuditLog.find()
    .sort({ timestamp: -1 })
    .limit(Number(limit))
    .populate('claim', 'extractedData.merchantName businessPurpose')
    .lean();
  res.json(logs);
});

module.exports = router;
