const router = require('express').Router();
const Claim = require('../models/Claim');
const User = require('../models/User');
const { protect, requireRole } = require('../middleware/auth');
const { generateClaimReport } = require('../services/reportGenerator');

// GET /api/reports/claim/:id — Download PDF report for a single claim
router.get('/claim/:id', protect, async (req, res) => {
  const claim = await Claim.findById(req.params.id)
    .populate('employee', 'name email location seniority department complianceScore')
    .lean({ virtuals: true });

  if (!claim) return res.status(404).json({ message: 'Claim not found' });

  // Only the employee or auditor/admin can download
  if (
    req.user.role === 'employee' &&
    claim.employee._id.toString() !== req.user._id.toString()
  ) {
    return res.status(403).json({ message: 'Access denied' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=claim-${claim._id.toString().slice(-8)}-report.pdf`);

  const doc = generateClaimReport(claim, claim.employee);
  doc.pipe(res);
});

module.exports = router;
