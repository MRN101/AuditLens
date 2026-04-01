const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['employee', 'auditor', 'admin'], default: 'employee' },
    employeeId: { type: String, unique: true, sparse: true },
    location: { type: String, default: 'default' },
    seniority: { type: String, enum: ['junior', 'mid', 'senior', 'executive'], default: 'mid' },
    department: { type: String },
    complianceScore: { type: Number, default: 100, min: 0, max: 100 },
    totalClaims: { type: Number, default: 0 },
    approvedClaims: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    profileImage: { type: String },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Recalculate compliance score
userSchema.methods.updateComplianceScore = function () {
  if (this.totalClaims === 0) return;
  this.complianceScore = Math.round((this.approvedClaims / this.totalClaims) * 100);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

// Indexes
userSchema.index({ role: 1, complianceScore: -1 });
userSchema.index({ email: 1 });

module.exports = mongoose.model('User', userSchema);
