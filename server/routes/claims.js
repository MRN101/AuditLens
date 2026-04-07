const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const Claim = require('../models/Claim');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const auditEngine = require('../services/auditEngine');
const duplicateService = require('../services/duplicateService');

// POST /api/claims/upload — Employee submits a new claim
router.post('/upload', protect, upload.single('receipt'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Receipt file is required' });

  const { businessPurpose, claimedDate, tripType, claimedAmount, claimedCurrency } = req.body;
  if (!businessPurpose || !claimedDate) {
    return res.status(400).json({ message: 'businessPurpose and claimedDate are required' });
  }
  if (businessPurpose.trim().length < 5) {
    return res.status(400).json({ message: 'Business purpose must be at least 5 characters' });
  }
  const parsedDate = new Date(claimedDate);
  if (isNaN(parsedDate.getTime())) {
    return res.status(400).json({ message: 'Invalid date format' });
  }

  const receiptPath = `/uploads/${req.file.filename}`;
  const fullPath = path.join(__dirname, '..', 'uploads', req.file.filename);
  
  // Compute image hash for duplicate detection
  const imageHash = await duplicateService.computeHash(fullPath);
  const duplicateCheck = await duplicateService.findDuplicate(imageHash, req.user._id);

  const claim = await Claim.create({
    employee: req.user._id,
    receiptImage: receiptPath,
    receiptFileName: req.file.originalname,
    imageHash,
    businessPurpose: businessPurpose.trim(),
    claimedDate: parsedDate,
    claimedAmount: claimedAmount ? Number(claimedAmount) : undefined,
    claimedCurrency: claimedCurrency || undefined,
    tripType: tripType || 'domestic',
    auditStatus: 'pending',
    flags: { duplicateReceipt: duplicateCheck.isDuplicate },
  });

  // Log creation
  AuditLog.log(claim._id, req.user, 'created', `Claim submitted: ${req.file.originalname}`, {
    tripType: tripType || 'domestic', claimedAmount, claimedCurrency,
  });

  // Trigger async audit (don't await — return immediately)
  auditEngine.processClaimAsync(claim._id, req.user, fullPath)
    .then(() => {
      const io = req.app.get('io');
      if (io) io.to(req.user._id.toString()).emit('claim_updated', { claimId: claim._id });
    })
    .catch((err) => console.error('[auditEngine] Error:', err.message));

  res.status(201).json({
    message: duplicateCheck.isDuplicate
      ? 'Claim submitted (possible duplicate detected)'
      : 'Claim submitted successfully. Processing...',
    claimId: claim._id,
    isDuplicate: duplicateCheck.isDuplicate,
  });
});

// GET /api/claims — Employee gets their own claims
router.get('/', protect, async (req, res) => {
  const { page = 1, limit = 10, status, tripType } = req.query;
  const filter = { employee: req.user._id, isDeleted: { $ne: true } };
  if (status) filter.auditStatus = status;
  if (tripType) filter.tripType = tripType;

  const [claims, total] = await Promise.all([
    Claim.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select('-extractedData.rawText'),
    Claim.countDocuments(filter),
  ]);

  res.json({ claims, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// GET /api/claims/:id — Get single claim detail
router.get('/:id', protect, async (req, res) => {
  const claim = await Claim.findById(req.params.id).populate('employee', 'name email location seniority department complianceScore');
  if (!claim || claim.isDeleted) return res.status(404).json({ message: 'Claim not found' });
  if (
    req.user.role === 'employee' &&
    claim.employee._id.toString() !== req.user._id.toString()
  ) {
    return res.status(403).json({ message: 'Access denied' });
  }
  res.json(claim);
});

// DELETE /api/claims/:id — Employee can delete their own pending claims
router.delete('/:id', protect, async (req, res) => {
  const claim = await Claim.findById(req.params.id);
  if (!claim || claim.isDeleted) return res.status(404).json({ message: 'Claim not found' });
  if (claim.employee.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Access denied' });
  }
  // Allow deletion of any claim status

  claim.isDeleted = true;
  claim.deletedAt = new Date();
  await claim.save();

  AuditLog.log(claim._id, req.user, 'deleted', 'Claim deleted by employee');

  // Clean up the uploaded file
  try {
    const filePath = path.join(__dirname, '..', claim.receiptImage);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch { /* non-critical */ }

  res.json({ message: 'Claim deleted' });
});

// POST /api/claims/:id/reaudit — Re-trigger audit for a failed claim
router.post('/:id/reaudit', protect, async (req, res) => {
  const claim = await Claim.findById(req.params.id);
  if (!claim) return res.status(404).json({ message: 'Claim not found' });
  if (claim.employee.toString() !== req.user._id.toString() && !['auditor', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }

  claim.auditStatus = 'pending';
  claim.processingError = null;
  await claim.save();

  AuditLog.log(claim._id, req.user, 'reaudited', 'Re-audit triggered');

  const fullPath = path.join(__dirname, '..', 'uploads', path.basename(claim.receiptImage));
  const employee = await User.findById(claim.employee);
  
  auditEngine.processClaimAsync(claim._id, employee, fullPath)
    .then(() => {
      const io = req.app.get('io');
      if (io) io.to(claim.employee.toString()).emit('claim_updated', { claimId: claim._id });
    })
    .catch((err) => console.error('[reaudit] Error:', err.message));

  res.json({ message: 'Re-audit triggered' });
});

module.exports = router;
