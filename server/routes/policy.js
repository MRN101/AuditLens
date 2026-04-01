const router = require('express').Router();
const path = require('path');
const Policy = require('../models/Policy');
const { protect, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const axios = require('axios');

// POST /api/policy/upload — Admin/auditor uploads a new policy PDF
router.post('/upload', protect, requireRole('admin', 'auditor'), upload.single('policy'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Policy PDF is required' });

  const { version, notes } = req.body;
  const policy = await Policy.create({
    version: version || `v${Date.now()}`,
    fileName: req.file.originalname,
    filePath: path.join(__dirname, '..', 'uploads', req.file.filename),
    fileSize: req.file.size,
    notes,
    uploadedBy: req.user._id,
  });

  // Trigger policy engine ingestion
  try {
    const engineUrl = process.env.POLICY_ENGINE_URL || 'http://localhost:8000';
    await axios.post(`${engineUrl}/ingest`, {
      policyId: policy._id.toString(),
      filePath: policy.filePath,
    });
    await Policy.findByIdAndUpdate(policy._id, { vectorStoreIngested: true, isActive: true });
    // Deactivate older versions
    await Policy.updateMany({ _id: { $ne: policy._id }, isDeleted: { $ne: true } }, { isActive: false });
    res.status(201).json({ message: 'Policy uploaded and ingested successfully', policy });
  } catch (err) {
    res.status(207).json({
      message: 'Policy saved but ingestion failed. Retry ingestion manually.',
      policy,
      error: err.message,
    });
  }
});

// GET /api/policy — List all policy versions
router.get('/', protect, requireRole('admin', 'auditor'), async (req, res) => {
  const policies = await Policy.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).populate('uploadedBy', 'name');
  res.json(policies);
});

// POST /api/policy/:id/activate — Set a specific version as active (auditor or admin)
router.post('/:id/activate', protect, requireRole('admin', 'auditor'), async (req, res) => {
  await Policy.updateMany({ isDeleted: { $ne: true } }, { isActive: false });
  const policy = await Policy.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
  if (!policy) return res.status(404).json({ message: 'Policy not found' });
  res.json({ message: 'Policy activated', policy });
});

// DELETE /api/policy/:id — Soft delete policy
router.delete('/:id', protect, requireRole('admin'), async (req, res) => {
  const policy = await Policy.findByIdAndUpdate(req.params.id, { isDeleted: true, isActive: false }, { new: true });
  if (!policy) return res.status(404).json({ message: 'Policy not found' });
  res.json({ message: 'Policy deleted' });
});

module.exports = router;
