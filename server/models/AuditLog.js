const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    claim: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim', required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String },
    action: {
      type: String,
      enum: [
        'created', 'ocr_completed', 'audit_completed', 'overridden',
        'deleted', 'reaudited', 'status_changed', 'comment_added',
        'trip_assigned', 'email_sent', 'duplicate_detected',
      ],
      required: true,
    },
    details: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

auditLogSchema.index({ claim: 1, timestamp: -1 });
auditLogSchema.index({ actor: 1, timestamp: -1 });

/**
 * Helper to create a log entry (fire-and-forget)
 */
auditLogSchema.statics.log = async function (claim, actor, action, details, metadata) {
  try {
    await this.create({
      claim,
      actor: actor?._id || actor,
      actorName: actor?.name || 'System',
      action,
      details,
      metadata,
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write log:', err.message);
  }
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
