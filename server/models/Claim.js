const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Receipt file info
    receiptImage: { type: String, required: true },
    receiptFileName: { type: String },
    imageHash: { type: String },
    
    // OCR extracted data
    extractedData: {
      merchantName: { type: String },
      date: { type: Date },
      amount: { type: Number },
      currency: { type: String, default: 'USD' },
      amountUSD: { type: Number },
      category: { type: String, enum: ['Meals', 'Transport', 'Lodging', 'Entertainment', 'Office Supplies', 'Other'], default: 'Other' },
      rawText: { type: String },
      ocrConfidence: { type: Number },
    },
    
    // Employee-supplied info
    businessPurpose: { type: String, required: true },
    claimedDate: { type: Date, required: true },
    
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
      contextualMismatch: { type: Boolean, default: false },
      anomalousAmount: { type: Boolean, default: false },
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
claimSchema.index({ 'extractedData.category': 1, 'extractedData.amountUSD': 1 });
claimSchema.index({ 'extractedData.merchantName': 'text', businessPurpose: 'text' });

// Virtual: effective status (considers override)
claimSchema.virtual('effectiveStatus').get(function () {
  if (this.auditorOverride?.isOverridden) return this.auditorOverride.overriddenStatus;
  return this.auditStatus;
});

claimSchema.set('toJSON', { virtuals: true });
claimSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Claim', claimSchema);
