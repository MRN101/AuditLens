import { useState, useEffect } from 'react'
import { X, FileText, AlertTriangle, CheckCircle2, XCircle, Clock, Repeat, Calendar, MapPin, Briefcase, MessageSquare, Copy, Check } from 'lucide-react'
import { claimsAPI, auditorAPI } from '../services/api'
import StatusBadge from './StatusBadge'
import RiskLevel from './RiskLevel'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function ClaimDetailModal({ claimId, onClose, onUpdate }) {
  const [claim, setClaim] = useState(null)
  const [loading, setLoading] = useState(true)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideStatus, setOverrideStatus] = useState('approved')
  const [overrideComment, setOverrideComment] = useState('')
  const [overriding, setOverriding] = useState(false)
  const [copied, setCopied] = useState(false)
  const [imageZoom, setImageZoom] = useState(false)
  const { user } = useAuthStore()
  const isAuditor = user?.role === 'auditor' || user?.role === 'admin'

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data } = await claimsAPI.getClaim(claimId)
        setClaim(data)
      } catch {
        toast.error('Failed to load claim')
        onClose()
      }
      setLoading(false)
    }
    load()
  }, [claimId])

  // ESC to close
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (imageZoom) setImageZoom(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, imageZoom])

  const handleOverride = async () => {
    if (!overrideComment.trim()) return toast.error('Comment required')
    setOverriding(true)
    try {
      await auditorAPI.overrideClaim(claimId, { status: overrideStatus, comment: overrideComment.trim() })
      toast.success('Override applied')
      onUpdate?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Override failed')
    }
    setOverriding(false)
  }

  const copyClaimId = () => {
    navigator.clipboard.writeText(claimId)
    setCopied(true)
    toast.success('Claim ID copied')
    setTimeout(() => setCopied(false), 2000)
  }

  const flagsList = claim ? Object.entries(claim.flags || {}).filter(([, v]) => v).map(([k]) => k) : []

  const flagLabels = {
    dateMismatch: 'Date Mismatch',
    overLimit: 'Over Limit',
    duplicateReceipt: 'Duplicate',
    blurryImage: 'Blurry Image',
    contextualMismatch: 'Context Mismatch',
    anomalousAmount: 'Anomalous Amount',
  }

  return (
    <>
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal">
          <div className="modal__header">
            <div className="flex items-center gap-3">
              <h3>Claim Details</h3>
              <button
                className="btn btn--ghost btn--sm"
                onClick={copyClaimId}
                style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}
                title="Copy claim ID"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {claimId?.slice(-8)}
              </button>
            </div>
            <button className="btn btn--ghost btn--icon" onClick={onClose}><X size={18} /></button>
          </div>

          {loading ? (
            <div className="modal__body">
              <div className="skeleton" style={{ height: 44, marginBottom: 16 }} />
              <div className="skeleton" style={{ height: 160, marginBottom: 16 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 48 }} />)}
              </div>
            </div>
          ) : claim ? (
            <div className="modal__body">
              {/* Status bar */}
              <div className="flex items-center justify-between mb-6" style={{ padding: '12px 16px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)' }}>
                <div className="flex items-center gap-3">
                  <StatusBadge status={claim.effectiveStatus || claim.auditStatus} />
                  <RiskLevel level={claim.riskLevel} />
                </div>
                <div className="flex items-center gap-3">
                  {claim.processingDurationMs && (
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Clock size={12} /> {(claim.processingDurationMs / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
              </div>

              {/* Receipt image */}
              {claim.receiptImage && (
                <div style={{ marginBottom: 20 }}>
                  <img
                    src={claim.receiptImage}
                    alt="Receipt"
                    onClick={() => setImageZoom(true)}
                    style={{
                      width: '100%', maxHeight: 240, objectFit: 'contain',
                      borderRadius: 'var(--radius-md)', background: 'var(--bg-inset)',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'zoom-in', transition: 'transform 0.2s ease',
                    }}
                  />
                </div>
              )}

              {/* Extracted data grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <InfoRow icon={<Briefcase size={13} />} label="Merchant" value={claim.extractedData?.merchantName || '—'} />
                <InfoRow icon={<Calendar size={13} />} label="Receipt Date" value={claim.extractedData?.date ? format(new Date(claim.extractedData.date), 'MMM dd, yyyy') : '—'} />
                <InfoRow label="Amount" value={
                  claim.extractedData?.amount
                    ? `${claim.extractedData.currency} ${claim.extractedData.amount.toLocaleString()}`
                    : '—'
                } mono />
                <InfoRow label="Category" value={claim.extractedData?.category || '—'} />
                <InfoRow icon={<MapPin size={13} />} label="Location" value={claim.employee?.location || '—'} />
                <InfoRow label="Confidence" value={claim.extractedData?.ocrConfidence ? `${Math.round(claim.extractedData.ocrConfidence * 100)}%` : '—'} mono />
              </div>

              {/* Business purpose */}
              <div style={{ marginBottom: 20 }}>
                <div className="form-label">Business Purpose</div>
                <div style={{ padding: '10px 14px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {claim.businessPurpose}
                </div>
              </div>

              {/* AI Explanation */}
              {claim.aiExplanation && (
                <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                    <FileText size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>AI Assessment</span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {claim.aiExplanation}
                  </p>
                  {claim.policyRulesCited?.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Policy rules cited:</div>
                      {claim.policyRulesCited.map((r, i) => (
                        <div key={i} className="text-xs" style={{ color: 'var(--text-secondary)', padding: '3px 0', fontStyle: 'italic' }}>
                          "{r}"
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Flags */}
              {flagsList.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div className="form-label">Flags</div>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    {flagsList.map((f) => (
                      <span key={f} className="badge badge--flagged" style={{ textTransform: 'none', fontSize: '0.72rem' }}>
                        <AlertTriangle size={10} /> {flagLabels[f] || f.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Override (if overridden) */}
              {claim.auditorOverride?.isOverridden && (
                <div style={{ padding: '12px 14px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', marginBottom: 16, border: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                    <Repeat size={13} style={{ color: 'var(--blue)' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Auditor Override</span>
                  </div>
                  <div className="text-sm text-secondary">
                    Changed to <StatusBadge status={claim.auditorOverride.overriddenStatus} />
                  </div>
                  <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                    "{claim.auditorOverride.comment}"
                  </div>
                </div>
              )}

              {/* Override form for auditor */}
              {isAuditor && !overrideOpen && (
                <button className="btn btn--secondary w-full" onClick={() => setOverrideOpen(true)}>
                  <MessageSquare size={14} /> Override Decision
                </button>
              )}

              {isAuditor && overrideOpen && (
                <div style={{ marginTop: 8 }}>
                  <div className="form-group">
                    <label className="form-label">New status</label>
                    <select className="form-select" value={overrideStatus} onChange={(e) => setOverrideStatus(e.target.value)}>
                      <option value="approved">Approved</option>
                      <option value="flagged">Flagged</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Comment</label>
                    <textarea
                      className="form-textarea"
                      placeholder="Reason for override..."
                      value={overrideComment}
                      onChange={(e) => setOverrideComment(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button className="btn btn--primary" onClick={handleOverride} disabled={overriding}>
                      {overriding ? <span className="spinner" /> : 'Apply Override'}
                    </button>
                    <button className="btn btn--ghost" onClick={() => setOverrideOpen(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Full-screen image zoom */}
      {imageZoom && claim?.receiptImage && (
        <div
          className="modal-overlay"
          style={{ zIndex: 200, alignItems: 'center', cursor: 'zoom-out' }}
          onClick={() => setImageZoom(false)}
        >
          <img
            src={claim.receiptImage}
            alt="Receipt zoomed"
            style={{
              maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain',
              borderRadius: 'var(--radius-lg)', animation: 'scaleIn 0.2s ease',
            }}
          />
        </div>
      )}
    </>
  )
}

function InfoRow({ icon, label, value, mono }) {
  return (
    <div>
      <div className="text-xs text-muted flex items-center gap-1" style={{ marginBottom: 2 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '0.88rem', fontWeight: 500, fontFamily: mono ? 'var(--font-mono)' : undefined }}>
        {value}
      </div>
    </div>
  )
}
