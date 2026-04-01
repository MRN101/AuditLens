const mongoose = require('mongoose');

const policySchema = new mongoose.Schema(
  {
    version: { type: String, required: true },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    fileSize: { type: Number },
    isActive: { type: Boolean, default: false },
    vectorStoreIngested: { type: Boolean, default: false },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

policySchema.index({ isActive: 1 });

module.exports = mongoose.model('Policy', policySchema);
