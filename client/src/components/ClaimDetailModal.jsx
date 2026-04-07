import { useState, useEffect } from 'react'
import { X, Download, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock, Shield, FileText, Home, Plane, Loader2 } from 'lucide-react'
import { auditorAPI, claimsAPI, reportsAPI, auditLogAPI } from '../services/api'
import { formatBase, formatConversion, BASE_SYMBOL } from '../utils/currencyUtils'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

const STATUS_CONFIG = {
  pending: { icon: Clock, color: '#6b7280', label: 'Pending' },
  processing: { icon: Clock, color: '#3b82f6', label: 'Processing' },
  approved: { icon: CheckCircle2, color: '#22c55e', label: 'Approved' },
  flagged: { icon: AlertTriangle, color: '#eab308', label: 'Flagged' },
  rejected: { icon: XCircle, color: '#ef4444', label: 'Rejected' },
}

const FLAG_LABELS = {
  dateMismatch: 'Date Mismatch', overLimit: 'Over Limit', duplicateReceipt: 'Duplicate Receipt',
  blurryImage: 'Blurry Image', contextualMismatch: 'Context Mismatch',
  anomalousAmount: 'Anomalous Amount', amountMismatch: 'Amount Mismatch',
  notAReceipt: 'Not a Receipt', mathError: 'Math Error',
}

export default function ClaimDetailModal({ claim, onClose, onUpdate, showOverride }) {
  const { user } = useAuthStore()
  const [tab, setTab] = useState('details')
  const [auditLogs, setAuditLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [overrideStatus, setOverrideStatus] = useState('')
  const [overrideComment, setOverrideComment] = useState('')
  const [overriding, setOverriding] = useState(false)
  const [reauditing, setReauditing] = useState(false)
  const [downloadingPDF, setDownloadingPDF] = useState(false)

  const isAuditor = user?.role === 'auditor' || user?.role === 'admin'
  const ext = claim.extractedData || {}
  const status = claim.effectiveStatus || claim.auditStatus || 'pending'
  const StatusIcon = STATUS_CONFIG[status]?.icon || Clock
  const statusColor = STATUS_CONFIG[status]?.color || '#6b7280'

  // Load audit trail when tab changes
  useEffect(() => {
    if (tab === 'timeline') {
      setLoadingLogs(true)
      auditLogAPI.getForClaim(claim._id)
        .then(({ data }) => setAuditLogs(data))
        .catch(() => {})
        .finally(() => setLoadingLogs(false))
    }
  }, [tab, claim._id])

  const handleOverride = async () => {
    if (!overrideStatus || !overrideComment.trim()) return toast.error('Select status and enter a comment')
    setOverriding(true)
    try {
      await auditorAPI.overrideClaim(claim._id, { status: overrideStatus, comment: overrideComment.trim() })
      toast.success('Override applied')
      onUpdate?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Override failed')
    }
    setOverriding(false)
  }

  const handleReaudit = async () => {
    setReauditing(true)
    try {
      await claimsAPI.reaudit(claim._id)
      toast.success('Re-audit triggered!')
      onUpdate?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Re-audit failed')
    }
    setReauditing(false)
  }

  const handleDownloadPDF = async () => {
    setDownloadingPDF(true)
    try {
      const { data } = await reportsAPI.downloadClaimPDF(claim._id)
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `claim-${claim._id.toString().slice(-8)}-report.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded!')
    } catch {
      toast.error('Failed to generate PDF')
    }
    setDownloadingPDF(false)
  }

  const flags = Object.entries(claim.flags || {}).filter(([, v]) => v)
  const canReaudit = ['flagged', 'rejected'].includes(claim.auditStatus) && !claim.auditorOverride?.isOverridden

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
        display: 'flex', justifyContent: 'center', paddingTop: '3vh',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '95%', maxWidth: 640, height: '94vh',
          background: 'var(--bg-elevated)', borderRadius: 12,
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <StatusIcon size={20} style={{ color: statusColor }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{ext.merchantName || 'Claim Details'}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {claim.tripType === 'international' ? <><Plane size={11} /> International</> : <><Home size={11} /> Domestic</>}
                <span>·</span>
                <span>{claim._id?.slice(-8)}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn--ghost btn--sm" onClick={handleDownloadPDF} disabled={downloadingPDF} title="Download PDF">
              {downloadingPDF ? <Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> : <><Download size={13} /> PDF</>}
            </button>
            <button
              onClick={onClose}
              title="Close"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: '50%',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-inset)', cursor: 'pointer',
                color: 'var(--text-primary)', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#ef4444'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-inset)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', padding: '0 20px', flexShrink: 0 }}>
          {[
            { key: 'details', label: 'Details' },
            { key: 'audit', label: 'AI Assessment' },
            { key: 'timeline', label: 'Timeline' },
            ...(showOverride && isAuditor ? [{ key: 'override', label: 'Override' }] : []),
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, minHeight: 0 }}>
          {tab === 'details' && (
            <div>
              {/* Status banner */}
              <div style={{
                padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 16,
                background: `${statusColor}15`, border: `1px solid ${statusColor}30`,
              }}>
                <div className="flex items-center gap-2">
                  <StatusIcon size={16} style={{ color: statusColor }} />
                  <span style={{ fontWeight: 600, color: statusColor, textTransform: 'capitalize' }}>
                    {STATUS_CONFIG[status]?.label}
                  </span>
                  {claim.riskLevel && (
                    <span className="text-xs" style={{
                      marginLeft: 'auto', padding: '2px 8px', borderRadius: 4,
                      background: 'var(--bg-inset)', textTransform: 'uppercase', fontWeight: 600,
                      color: { high: '#ef4444', medium: '#eab308', low: '#22c55e' }[claim.riskLevel],
                    }}>
                      {claim.riskLevel} risk
                    </span>
                  )}
                </div>
              </div>

              {/* Extracted data grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                <div>
                  <div className="text-xs text-muted">Merchant</div>
                  <div className="text-sm" style={{ fontWeight: 550 }}>{ext.merchantName || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Date</div>
                  <div className="text-sm">{ext.date ? new Date(ext.date).toLocaleDateString('en-IN') : '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Original Amount</div>
                  <div className="text-sm mono" style={{ fontWeight: 600 }}>
                    {ext.currency} {ext.amount?.toLocaleString('en-IN') || '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">Converted ({BASE_SYMBOL})</div>
                  {ext.amountBase && ext.amountBase !== ext.amount ? (
                    <div className="text-sm mono" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                      {formatBase(ext.amountBase)}
                      <span className="text-xs text-muted" style={{ marginLeft: 6, fontWeight: 400 }}>
                        (×{(ext.amountBase / ext.amount).toFixed(2)})
                      </span>
                    </div>
                  ) : ext.currency === 'INR' ? (
                    <div className="text-sm mono" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                      {formatBase(ext.amount)}
                    </div>
                  ) : (
                    <div className="text-sm" style={{ color: 'var(--amber)', fontWeight: 500 }}>
                      ⚠ Not converted
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted">Category</div>
                  <div className="text-sm">{ext.category || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Trip Type</div>
                  <div className="text-sm">{claim.tripType === 'international' ? '🌍 International' : '🇮🇳 Domestic'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">OCR Confidence</div>
                  <div className="text-sm">{ext.ocrConfidence ? `${Math.round(ext.ocrConfidence * 100)}%` : '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Processing Time</div>
                  <div className="text-sm">{claim.processingDurationMs ? `${(claim.processingDurationMs / 1000).toFixed(1)}s` : '—'}</div>
                </div>
              </div>

              {/* Business purpose */}
              <div style={{ marginTop: 16 }}>
                <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Business Purpose</div>
                <div className="text-sm" style={{ padding: '8px 12px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)', lineHeight: 1.5 }}>
                  {claim.businessPurpose || '—'}
                </div>
              </div>

              {/* Employee claimed amount */}
              {claim.claimedAmount && (
                <div style={{ marginTop: 12 }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Claimed Amount (Employee-entered)</div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm mono">{claim.claimedCurrency || 'INR'} {claim.claimedAmount?.toLocaleString()}</span>
                    {claim.flags?.amountMismatch ? (
                      <span className="text-xs" style={{ color: 'var(--red)', fontWeight: 600 }}>⚠ Mismatch with OCR</span>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--green)', fontWeight: 600 }}>✓ Matches OCR</span>
                    )}
                  </div>
                </div>
              )}

              {/* Flags */}
              {flags.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 6 }}>Flags</div>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    {flags.map(([key]) => (
                      <span key={key} style={{
                        padding: '3px 10px', borderRadius: 4, fontSize: '0.73rem', fontWeight: 600,
                        background: 'rgba(234,179,8,0.12)', color: 'var(--amber)',
                      }}>
                        ⚠ {FLAG_LABELS[key] || key}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Duplicate warning */}
              {claim.duplicateInfo?.isDuplicate && (
                <div style={{
                  marginTop: 16, padding: '12px 14px', borderRadius: 'var(--radius-md)',
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                }}>
                  <div className="text-sm" style={{ fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>
                    🔁 Duplicate Receipt Detected
                  </div>
                  <div className="text-xs text-muted">
                    This receipt is a {claim.duplicateInfo.matchType} match ({claim.duplicateInfo.similarity}% similarity)
                    with a previously submitted claim.
                  </div>
                </div>
              )}

              {/* Line Items */}
              {claim.lineItems?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 6 }}>Line Items ({claim.lineItems.length})</div>
                  <div style={{ background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 500, color: 'var(--text-muted)' }}>Item</th>
                          <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 500, color: 'var(--text-muted)', width: 40 }}>Qty</th>
                          <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 500, color: 'var(--text-muted)', width: 70 }}>Price</th>
                          <th style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 500, color: 'var(--text-muted)', width: 70 }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {claim.lineItems.map((item, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '5px 10px' }}>{item.description}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>{item.quantity}</td>
                            <td className="mono" style={{ padding: '5px 10px', textAlign: 'right' }}>{item.unitPrice?.toLocaleString('en-IN')}</td>
                            <td className="mono" style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 600 }}>{item.totalPrice?.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tax Breakdown */}
              {claim.taxBreakdown?.total && (
                <div style={{ marginTop: 16 }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                    <span className="text-xs text-muted">Tax Breakdown</span>
                    {claim.taxBreakdown.mathValid === true && (
                      <span className="text-xs" style={{ color: 'var(--green)', fontWeight: 600 }}>✓ Math verified</span>
                    )}
                    {claim.taxBreakdown.mathValid === false && (
                      <span className="text-xs" style={{ color: '#ef4444', fontWeight: 600 }}>⚠ Math error</span>
                    )}
                  </div>
                  <div style={{
                    background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px', fontSize: '0.8rem',
                  }}>
                    <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="text-muted">Subtotal</span>
                      <span className="mono">{ext.currency} {claim.taxBreakdown.subtotal?.toLocaleString('en-IN') || '—'}</span>
                    </div>
                    {claim.taxBreakdown.taxAmount > 0 && (
                      <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="text-muted">Tax{claim.taxBreakdown.taxPercent ? ` (${claim.taxBreakdown.taxPercent}%)` : ''}</span>
                        <span className="mono">+ {claim.taxBreakdown.taxAmount?.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {claim.taxBreakdown.tipAmount > 0 && (
                      <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="text-muted">Tip</span>
                        <span className="mono">+ {claim.taxBreakdown.tipAmount?.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {claim.taxBreakdown.discountAmount > 0 && (
                      <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="text-muted">Discount</span>
                        <span className="mono" style={{ color: 'var(--green)' }}>- {claim.taxBreakdown.discountAmount?.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {claim.taxBreakdown.serviceCharge > 0 && (
                      <div className="flex" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="text-muted">Service Charge</span>
                        <span className="mono">+ {claim.taxBreakdown.serviceCharge?.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 6, marginTop: 4 }}>
                      <div className="flex" style={{ justifyContent: 'space-between', fontWeight: 700 }}>
                        <span>Total</span>
                        <span className="mono">{ext.currency} {claim.taxBreakdown.total?.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* OCR Corrections */}
              {claim.ocrCorrections?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 6 }}>AI Self-Corrections ({claim.ocrCorrections.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {claim.ocrCorrections.map((c, i) => (
                      <div key={i} style={{
                        padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                        background: 'rgba(59,130,246,0.06)', fontSize: '0.78rem',
                        border: '1px solid rgba(59,130,246,0.15)',
                      }}>
                        <span className="text-muted">{c.field}:</span>{' '}
                        <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>{String(c.old)}</span>
                        {' → '}
                        <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{String(c.new)}</span>
                        {c.reason && <span className="text-xs text-muted" style={{ marginLeft: 6 }}>({c.reason})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Override info */}
              {claim.auditorOverride?.isOverridden && (
                <div style={{
                  marginTop: 16, padding: '12px 14px', borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)',
                }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>
                    <Shield size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                    Auditor Override
                  </div>
                  <div className="text-sm" style={{ fontWeight: 550 }}>
                    Changed to: <span style={{ textTransform: 'capitalize', color: STATUS_CONFIG[claim.auditorOverride.overriddenStatus]?.color }}>{claim.auditorOverride.overriddenStatus}</span>
                  </div>
                  <div className="text-sm" style={{ fontStyle: 'italic', marginTop: 4 }}>"{claim.auditorOverride.comment}"</div>
                  <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                    {claim.auditorOverride.overriddenAt && formatDistanceToNow(new Date(claim.auditorOverride.overriddenAt), { addSuffix: true })}
                  </div>
                </div>
              )}

              {/* Re-audit button */}
              {canReaudit && (
                <button className="btn btn--secondary w-full" style={{ marginTop: 16 }} onClick={handleReaudit} disabled={reauditing}>
                  {reauditing ? <><Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> Re-auditing...</> : <><RefreshCw size={14} /> Re-audit This Claim</>}
                </button>
              )}
            </div>
          )}

          {tab === 'audit' && (
            <div>
              {claim.aiExplanation ? (
                <div style={{
                  padding: '14px 16px', borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)',
                  lineHeight: 1.6, fontSize: '0.88rem', marginBottom: 16,
                }}>
                  {claim.aiExplanation}
                </div>
              ) : (
                <div className="text-sm text-muted" style={{ padding: 24, textAlign: 'center' }}>No AI assessment yet</div>
              )}

              {claim.policyRulesCited?.length > 0 && (
                <div>
                  <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                    <FileText size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                    Policy Rules Cited
                  </div>
                  {claim.policyRulesCited.map((rule, i) => (
                    <div key={i} style={{
                      padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-inset)', marginBottom: 6,
                      fontSize: '0.82rem', fontStyle: 'italic', color: 'var(--text-secondary)',
                      borderLeft: '3px solid var(--accent)',
                    }}>
                      "{rule}"
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'timeline' && (
            <div>
              {loadingLogs ? (
                <div className="flex items-center justify-center gap-2" style={{ padding: 32 }}>
                  <Loader2 size={16} style={{ animation: 'spin 0.6s linear infinite', color: 'var(--accent)' }} />
                  <span className="text-sm text-muted">Loading timeline...</span>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-sm text-muted" style={{ textAlign: 'center', padding: 32 }}>No activity recorded yet</div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 20 }}>
                  <div style={{
                    position: 'absolute', left: 7, top: 0, bottom: 0, width: 2,
                    background: 'var(--border-subtle)',
                  }} />
                  {auditLogs.map((log, i) => (
                    <div key={i} style={{ position: 'relative', marginBottom: 16, paddingBottom: 8 }}>
                      <div style={{
                        position: 'absolute', left: -16, top: 4, width: 10, height: 10,
                        borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-elevated)',
                      }} />
                      <div className="text-xs text-muted" style={{ marginBottom: 2 }}>
                        {log.actorName || 'System'} · {log.timestamp ? formatDistanceToNow(new Date(log.timestamp), { addSuffix: true }) : ''}
                      </div>
                      <div className="text-sm" style={{ fontWeight: 500 }}>
                        <span style={{ textTransform: 'capitalize', color: 'var(--accent)' }}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {log.details && (
                        <div className="text-xs text-secondary" style={{ marginTop: 2, lineHeight: 1.4 }}>{log.details}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'override' && isAuditor && (
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 12 }}>Manual Override</div>
              <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
                Override the AI's decision. This action is logged and affects the employee's compliance score.
              </p>
              <div className="form-group">
                <label className="form-label">New Status</label>
                <div className="flex gap-2">
                  {['approved', 'flagged', 'rejected'].map(s => (
                    <button
                      key={s}
                      className={`btn btn--sm ${overrideStatus === s ? 'btn--primary' : 'btn--secondary'}`}
                      onClick={() => setOverrideStatus(s)}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Comment (required)</label>
                <textarea
                  className="form-textarea"
                  placeholder="Explain why you're overriding the AI decision..."
                  value={overrideComment}
                  onChange={e => setOverrideComment(e.target.value)}
                />
              </div>
              <button className="btn btn--primary w-full" onClick={handleOverride} disabled={overriding}>
                {overriding ? <><Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> Overriding...</> : <><Shield size={14} /> Apply Override</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
