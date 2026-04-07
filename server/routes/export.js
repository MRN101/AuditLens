const router = require('express').Router();
const jwt = require('jsonwebtoken');
const Claim = require('../models/Claim');
const User = require('../models/User');
const { protect, requireRole } = require('../middleware/auth');

const requireAuditor = requireRole('auditor', 'admin');

const BASE_CURRENCY = process.env.BASE_CURRENCY || 'INR';

/**
 * Download-specific auth: accepts token from query param OR Authorization header.
 * This allows window.open() to work for file downloads.
 */
const protectDownload = async (req, res, next) => {
  // Try query param first (for window.open downloads), then header
  let token = req.query.token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-passwordHash');
    if (!req.user) return res.status(401).json({ message: 'User not found' });
    if (!req.user.isActive) return res.status(403).json({ message: 'Account deactivated' });
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token invalid or expired' });
  }
};

/**
 * GET /api/export/claims
 * Export claims data as CSV. Supports Tally-compatible format.
 *
 * Query params:
 *   format: 'standard' | 'tally' (default: standard)
 *   status: 'approved' | 'flagged' | 'rejected' | 'all' (default: approved)
 *   dateFrom: YYYY-MM-DD
 *   dateTo: YYYY-MM-DD
 *   tripType: 'domestic' | 'international' | 'all'
 *   category: specific category or 'all'
 *   token: JWT token (for window.open downloads)
 */
router.get('/claims', protectDownload, requireAuditor, async (req, res) => {
  try {
    const {
      format = 'standard',
      status = 'approved',
      dateFrom,
      dateTo,
      tripType = 'all',
      category = 'all',
    } = req.query;

    // Build filter
    const filter = { isDeleted: { $ne: true } };
    if (status !== 'all') filter.auditStatus = status;
    if (tripType !== 'all') filter.tripType = tripType;
    if (category !== 'all') filter['extractedData.category'] = category;

    if (dateFrom || dateTo) {
      filter.claimedDate = {};
      if (dateFrom) filter.claimedDate.$gte = new Date(dateFrom);
      if (dateTo) filter.claimedDate.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const claims = await Claim.find(filter)
      .populate('employee', 'name email department location')
      .sort({ claimedDate: -1 })
      .lean();

    if (claims.length === 0) {
      return res.status(404).json({ message: 'No claims match the filter criteria.' });
    }

    let csv;
    let filename;

    if (format === 'tally') {
      csv = buildTallyCSV(claims);
      filename = `tally_vouchers_${new Date().toISOString().split('T')[0]}.csv`;
    } else {
      csv = buildStandardCSV(claims);
      filename = `claims_export_${new Date().toISOString().split('T')[0]}.csv`;
    }

    // Disable security headers that interfere with downloads
    res.removeHeader('X-Download-Options');
    res.removeHeader('ETag');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    // BOM for Excel UTF-8 compatibility
    const csvData = '\ufeff' + csv;
    res.setHeader('Content-Length', Buffer.byteLength(csvData, 'utf8'));
    res.end(csvData);

  } catch (err) {
    console.error('[export] Error:', err.message);
    res.status(500).json({ message: 'Export failed' });
  }
});

/**
 * GET /api/export/download/:filename
 * Direct download route with filename in URL path.
 * Browsers use the last URL path segment as the filename fallback.
 */
router.get('/download/:filename', protectDownload, requireAuditor, async (req, res) => {
  try {
    const {
      format = 'standard',
      status = 'approved',
      dateFrom,
      dateTo,
      tripType = 'all',
      category = 'all',
    } = req.query;

    // Use same filter logic as /claims route
    const filter = { isDeleted: { $ne: true } };
    if (status !== 'all') filter.auditStatus = status;
    if (tripType !== 'all') filter.tripType = tripType;
    if (category !== 'all') filter['extractedData.category'] = category;

    if (dateFrom || dateTo) {
      filter.claimedDate = {};
      if (dateFrom) filter.claimedDate.$gte = new Date(dateFrom);
      if (dateTo) filter.claimedDate.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const claims = await Claim.find(filter)
      .populate('employee', 'name email department location')
      .sort({ claimedDate: -1 })
      .lean();

    let csv;
    if (format === 'tally') {
      csv = buildTallyCSV(claims);
    } else {
      csv = buildStandardCSV(claims);
    }

    const filename = req.params.filename;

    res.removeHeader('X-Download-Options');
    res.removeHeader('ETag');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    const csvData = '\ufeff' + csv;
    res.setHeader('Content-Length', Buffer.byteLength(csvData, 'utf8'));
    res.end(csvData);

  } catch (err) {
    console.error('[export] Download error:', err.message);
    res.status(500).json({ message: 'Export failed' });
  }
});

/**
 * Standard export format — all fields in a flat table
 */
function buildStandardCSV(claims) {
  const headers = [
    'Claim ID',
    'Date',
    'Employee Name',
    'Employee Email',
    'Department',
    'Merchant',
    'Category',
    'Trip Type',
    'Original Amount',
    'Original Currency',
    `Amount (${BASE_CURRENCY})`,
    'Payment Method',
    'Business Purpose',
    'Status',
    'Risk Level',
    'AI Explanation',
    'Line Items',
    'Subtotal',
    'Tax',
    'Tax %',
    'Tip',
    'Discount',
    'Total',
    'Math Valid',
    'Flags',
    'Duplicate',
    'Override',
    'Override Comment',
    'Submitted At',
    'Processing Time (s)',
  ];

  const rows = claims.map(c => {
    const ext = c.extractedData || {};
    const tax = c.taxBreakdown || {};
    const flags = Object.entries(c.flags || {}).filter(([, v]) => v).map(([k]) => k).join('; ');
    const lineItemsSummary = (c.lineItems || []).map(i => `${i.description} (${i.quantity}×${i.unitPrice})`).join('; ');

    return [
      c._id?.toString()?.slice(-8),
      ext.date ? new Date(ext.date).toISOString().split('T')[0] : c.claimedDate?.toISOString().split('T')[0] || '',
      c.employee?.name || '',
      c.employee?.email || '',
      c.employee?.department || '',
      ext.merchantName || '',
      ext.category || '',
      c.tripType || 'domestic',
      ext.amount || '',
      ext.currency || '',
      ext.amountBase || '',
      ext.paymentMethod || '',
      c.businessPurpose || '',
      c.auditStatus || '',
      c.riskLevel || '',
      (c.aiExplanation || '').replace(/"/g, '""'),
      lineItemsSummary,
      tax.subtotal || '',
      tax.taxAmount || '',
      tax.taxPercent || '',
      tax.tipAmount || '',
      tax.discountAmount || '',
      tax.total || '',
      tax.mathValid != null ? (tax.mathValid ? 'Yes' : 'No') : '',
      flags,
      c.duplicateInfo?.isDuplicate ? `Yes (${c.duplicateInfo.matchType})` : 'No',
      c.auditorOverride?.isOverridden ? c.auditorOverride.overriddenStatus : '',
      c.auditorOverride?.comment ? c.auditorOverride.comment.replace(/"/g, '""') : '',
      c.createdAt?.toISOString() || '',
      c.processingDurationMs ? (c.processingDurationMs / 1000).toFixed(1) : '',
    ];
  });

  return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\r\n');
}

/**
 * Tally-compatible voucher format
 * Generates a CSV that can be imported into Tally Prime / Tally ERP 9
 * as Journal or Payment vouchers.
 *
 * Format:
 *   Voucher Date, Voucher Type, Voucher Number,
 *   Ledger (Dr), Ledger (Cr), Amount,
 *   Narration, Employee, Category, GST Amount
 */
function buildTallyCSV(claims) {
  const headers = [
    'Voucher Date',
    'Voucher Type',
    'Voucher Number',
    'Dr Ledger',
    'Cr Ledger',
    'Amount',
    'Narration',
    'Cost Centre',
    'Employee Name',
    'Category',
    'GST Amount',
    'Bill Reference',
    'Original Currency',
    'Original Amount',
  ];

  // Map expense categories to Tally ledger names
  const CATEGORY_LEDGERS = {
    'Meals': 'Staff Welfare Expenses',
    'Transport': 'Travelling Expenses',
    'Lodging': 'Hotel & Accommodation',
    'Entertainment': 'Business Entertainment',
    'Office Supplies': 'Office Expenses',
    'Other': 'Miscellaneous Expenses',
  };

  let voucherNum = 1;

  const rows = claims.map(c => {
    const ext = c.extractedData || {};
    const tax = c.taxBreakdown || {};
    const amount = ext.amountBase || ext.amount || 0;
    const category = ext.category || 'Other';
    const drLedger = CATEGORY_LEDGERS[category] || 'Miscellaneous Expenses';
    const date = ext.date ? new Date(ext.date) : c.claimedDate;
    const dateStr = date ? `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}` : '';

    const narration = [
      ext.merchantName || 'Unknown Merchant',
      c.businessPurpose || '',
      c.tripType === 'international' ? '(International)' : '',
    ].filter(Boolean).join(' — ');

    const row = [
      dateStr,
      'Payment',
      `EXP/${voucherNum.toString().padStart(4, '0')}`,
      drLedger,
      'Employee Reimbursement Payable',
      amount.toFixed(2),
      narration.replace(/"/g, '""'),
      c.employee?.department || 'General',
      c.employee?.name || '',
      category,
      (tax.taxAmount || 0).toFixed(2),
      c._id?.toString()?.slice(-8),
      ext.currency || BASE_CURRENCY,
      (ext.amount || 0).toFixed(2),
    ];

    voucherNum++;
    return row;
  });

  return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\r\n');
}

/**
 * GET /api/export/summary
 * Quick stats for the export preview
 */
router.get('/summary', protect, requireAuditor, async (req, res) => {
  try {
    const { status = 'approved', dateFrom, dateTo, tripType = 'all', category = 'all' } = req.query;

    const filter = { isDeleted: { $ne: true } };
    if (status !== 'all') filter.auditStatus = status;
    if (tripType !== 'all') filter.tripType = tripType;
    if (category !== 'all') filter['extractedData.category'] = category;
    if (dateFrom || dateTo) {
      filter.claimedDate = {};
      if (dateFrom) filter.claimedDate.$gte = new Date(dateFrom);
      if (dateTo) filter.claimedDate.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const stats = await Claim.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$extractedData.amountBase' },
          categories: { $addToSet: '$extractedData.category' },
        },
      },
    ]);

    const result = stats[0] || { count: 0, totalAmount: 0, categories: [] };
    res.json({
      count: result.count,
      totalAmount: Math.round(result.totalAmount * 100) / 100,
      categories: result.categories,
      currency: BASE_CURRENCY,
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to get summary' });
  }
});

module.exports = router;
