const router = require('express').Router();
const path = require('path');
const Trip = require('../models/Trip');
const Claim = require('../models/Claim');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const auditEngine = require('../services/auditEngine');
const duplicateService = require('../services/duplicateService');

// POST /api/trips — Create a new trip
router.post('/', protect, async (req, res) => {
  const { tripName, tripType, destination, startDate, endDate, notes } = req.body;
  if (!tripName || !tripType || !startDate || !endDate) {
    return res.status(400).json({ message: 'tripName, tripType, startDate, and endDate are required' });
  }

  const trip = await Trip.create({
    employee: req.user._id,
    tripName: tripName.trim(),
    tripType,
    destination: destination?.trim(),
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    notes: notes?.trim(),
  });

  res.status(201).json({ message: 'Trip created', trip });
});

// POST /api/trips/:id/receipts — Add multiple receipts to a trip
router.post('/:id/receipts', protect, upload.array('receipts', 20), async (req, res) => {
  const trip = await Trip.findById(req.params.id);
  if (!trip) return res.status(404).json({ message: 'Trip not found' });
  if (trip.employee.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'Access denied' });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'At least one receipt file is required' });
  }

  const { businessPurpose } = req.body;
  const results = [];

  for (const file of req.files) {
    const receiptPath = `/uploads/${file.filename}`;
    const fullPath = path.join(__dirname, '..', 'uploads', file.filename);
    const imageHash = await duplicateService.computeHash(fullPath);

    const claim = await Claim.create({
      employee: req.user._id,
      receiptImage: receiptPath,
      receiptFileName: file.originalname,
      imageHash,
      businessPurpose: (businessPurpose || trip.tripName).trim(),
      claimedDate: trip.startDate,
      claimedDateEnd: trip.endDate,
      tripType: trip.tripType,
      tripId: trip._id,
      auditStatus: 'pending',
      flags: { duplicateReceipt: false },
    });

    trip.claims.push(claim._id);

    // Trigger async audit
    auditEngine.processClaimAsync(claim._id, req.user, fullPath)
      .then(() => {
        const io = req.app.get('io');
        if (io) io.to(req.user._id.toString()).emit('claim_updated', { claimId: claim._id });
      })
      .catch((err) => console.error('[trips] Audit error:', err.message));

    results.push({ claimId: claim._id, fileName: file.originalname, isDuplicate: false });
  }

  await trip.save();
  res.status(201).json({ message: `${results.length} receipts uploaded to trip`, results, tripId: trip._id });
});

// GET /api/trips — Get my trips
router.get('/', protect, async (req, res) => {
  const { tripType, status } = req.query;
  const filter = { employee: req.user._id, isDeleted: { $ne: true } };
  if (tripType) filter.tripType = tripType;
  if (status) filter.status = status;

  const trips = await Trip.find(filter)
    .sort({ createdAt: -1 })
    .populate('claims', 'auditStatus extractedData.amountBase extractedData.category');

  // Calculate total amounts
  const tripsWithTotals = trips.map(t => {
    const tripObj = t.toObject();
    tripObj.totalAmountBase = (tripObj.claims || []).reduce(
      (sum, c) => sum + (c.extractedData?.amountBase || 0), 0
    );
    tripObj.claimCount = tripObj.claims?.length || 0;
    return tripObj;
  });

  res.json(tripsWithTotals);
});

// GET /api/trips/:id — Get trip details
router.get('/:id', protect, async (req, res) => {
  const trip = await Trip.findById(req.params.id)
    .populate('claims');
  if (!trip || trip.isDeleted) return res.status(404).json({ message: 'Trip not found' });
  if (trip.employee.toString() !== req.user._id.toString() && !['auditor', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  res.json(trip);
});

module.exports = router;
