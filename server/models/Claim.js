const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  description: { type: String },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number },
  totalPrice: { type: Number },
}, { _id: false });

const taxBreakdownSchema = new mongoose.Schema({
  subtotal: { type: Number },
  taxAmount: { type: Number },
  taxPercent: { type: Number },
  tipAmount: { type: Number },
  discountAmount: { type: Number },
  serviceCharge: { type: Number },
  total: { type: Number },
  mathValid: { type: Boolean },
  mathDetails: { type: String },
}, { _id: false });

const correctionSchema = new mongoose.Schema({
  field: { type: String },
  old: { type: mongoose.Schema.Types.Mixed },
  new: { type: mongoose.Schema.Types.Mixed },
  reason: { type: String },
}, { _id: false });

const claimSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Receipt file info
    receiptImage: { type: String, required: true },
    receiptFileName: { type: String },
    thumbnailImage: { type: String },
    imageHash: { type: String },
    perceptualHash: { type: String },
    
    // OCR extracted data
    extractedData: {
      merchantName: { type: String },
      merchantAddress: { type: String },
      date: { type: Date },
      time: { type: String },
      amount: { type: Number },
      currency: { type: String, default: 'INR' },
      amountBase: { type: Number },
      baseCurrency: { type: String, default: 'INR' },
      category: { type: String, enum: ['Meals', 'Transport', 'Lodging', 'Entertainment', 'Office Supplies', 'Other'], default: 'Other' },
      rawText: { type: String },
      ocrConfidence: { type: Number },
      paymentMethod: { type: String, enum: ['cash', 'card', 'upi', 'online', 'unknown'], default: 'unknown' },
    },

    // Enhanced: Line items from receipt
    lineItems: [lineItemSchema],

    // Enhanced: Tax breakdown
    taxBreakdown: taxBreakdownSchema,

    // Enhanced: AI self-corrections made during OCR
    ocrCorrections: [correctionSchema],

    // Enhanced: Receipt classification
    receiptClassification: {
      isReceipt: { type: Boolean },
      documentType: { type: String },
      confidence: { type: Number },
      reason: { type: String },
    },

    // Enhanced: Duplicate detection
    duplicateInfo: {
      isDuplicate: { type: Boolean, default: false },
      matchType: { type: String, enum: ['exact', 'perceptual', 'metadata', null] },
      matchedClaimId: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim' },
      similarity: { type: Number },
    },
    
    // Employee-supplied info
    businessPurpose: { type: String, required: true },
    claimedDate: { type: Date, required: true },
    claimedDateEnd: { type: Date },  // End of trip date range (batch uploads)
    claimedAmount: { type: Number },
    claimedCurrency: { type: String },
    
    // Trip classification
    tripType: { type: String, enum: ['domestic', 'international'], default: 'domestic' },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
    
    // Audit result
    auditStatus: {
      type: String,
      enum: ['pending', 'processing', 'approved', 'flagged', 'rejected'],
      default: 'pending',
    },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    aiExplanation: { type: String },
    policyRulesCited: [{ type: String }],
    
    // Flags
    flags: {
      dateMismatch: { type: Boolean, default: false },
      overLimit: { type: Boolean, default: false },
      duplicateReceipt: { type: Boolean, default: false },
      blurryImage: { type: Boolean, default: false },
      notAReceipt: { type: Boolean, default: false },
      mathError: { type: Boolean, default: false },
      contextualMismatch: { type: Boolean, default: false },
      anomalousAmount: { type: Boolean, default: false },
      amountMismatch: { type: Boolean, default: false },
    },
    
    // Human-in-the-loop override
    auditorOverride: {
      isOverridden: { type: Boolean, default: false },
      overriddenStatus: { type: String },
      comment: { type: String },
      auditorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      overriddenAt: { type: Date },
    },
    
    // Processing metadata
    processingError: { type: String },
    processingDurationMs: { type: Number },

    // Soft delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

// Indexes for efficient queries
claimSchema.index({ employee: 1, createdAt: -1 });
claimSchema.index({ auditStatus: 1, riskLevel: 1 });
claimSchema.index({ imageHash: 1 });
claimSchema.index({ perceptualHash: 1 });
claimSchema.index({ tripType: 1, auditStatus: 1 });
claimSchema.index({ tripId: 1 });
claimSchema.index({ 'extractedData.category': 1, 'extractedData.amountBase': 1 });
claimSchema.index({ 'extractedData.merchantName': 'text', businessPurpose: 'text' });

// Virtual: effective status (considers override)
claimSchema.virtual('effectiveStatus').get(function () {
  if (this.auditorOverride?.isOverridden) return this.auditorOverride.overriddenStatus;
  return this.auditStatus;
});

claimSchema.set('toJSON', { virtuals: true });
claimSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Claim', claimSchema);
