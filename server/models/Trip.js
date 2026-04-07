const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tripName: { type: String, required: true, trim: true },
    tripType: { type: String, enum: ['domestic', 'international'], required: true },
    destination: { type: String, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    claims: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Claim' }],
    totalAmountBase: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['open', 'submitted', 'under_review', 'closed'],
      default: 'open',
    },
    notes: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

tripSchema.index({ employee: 1, createdAt: -1 });
tripSchema.index({ tripType: 1, status: 1 });

module.exports = mongoose.model('Trip', tripSchema);
