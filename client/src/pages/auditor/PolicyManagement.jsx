import { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, Check, Clock, AlertCircle } from 'lucide-react'
import { policyAPI } from '../../services/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function PolicyManagement() {
  const [policies, setPolicies] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState(null)
  const [version, setVersion] = useState('')

  const loadPolicies = async () => {
    try {
      const { data } = await policyAPI.list()
      setPolicies(data)
    } catch { /* */ }
    setLoading(false)
  }

  useEffect(() => { loadPolicies() }, [])

  const onDrop = useCallback((accepted) => {
    if (accepted.length) setFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': [] },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
  })

  const handleUpload = async () => {
    if (!file) return toast.error('Select a PDF file')
    setUploading(true)
    const formData = new FormData()
    formData.append('policy', file)
    formData.append('version', version || `v${Date.now()}`)
    try {
      const { data } = await policyAPI.upload(formData)
      toast.success(data.message)
      setFile(null)
      setVersion('')
      loadPolicies()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed')
    }
    setUploading(false)
  }

  const handleActivate = async (id) => {
    try {
      await policyAPI.activate(id)
      toast.success('Policy activated')
      loadPolicies()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Policy Management</h2>
        <p>Upload and manage the company Travel & Expense policy document</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* Upload */}
        <div className="card">
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>Upload New Policy</div>

          <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dropzone--active' : ''}`} style={{ padding: '32px 24px', marginBottom: 16 }}>
            <input {...getInputProps()} />
            <FileText className="dropzone__icon" />
            <p className="dropzone__text">
              {file ? file.name : isDragActive ? 'Drop PDF here...' : 'Drop your policy PDF here'}
            </p>
            <p className="dropzone__hint">PDF format only, max 20MB</p>
          </div>

          <div className="form-group">
            <label className="form-label">Version label</label>
            <input
              className="form-input"
              placeholder="e.g. v2.3 — March 2026"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </div>

          <button className="btn btn--primary w-full" onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? <span className="spinner" /> : <><Upload size={14} /> Upload & Ingest</>}
          </button>

          <div className="form-hint" style={{ marginTop: 8 }}>
            Uploading will automatically chunk and embed the PDF into the vector store for semantic search.
          </div>
        </div>

        {/* Policy versions list */}
        <div className="card">
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>Policy Versions</div>
          {loading ? (
            <div className="text-center" style={{ padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : policies.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <FileText size={36} />
              <p>No policies uploaded yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {policies.map((p) => (
                <div
                  key={p._id}
                  style={{
                    padding: '12px 14px',
                    background: p.isActive ? 'var(--accent-subtle)' : 'var(--bg-inset)',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${p.isActive ? 'var(--accent-muted)' : 'var(--border-subtle)'}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm" style={{ fontWeight: 600 }}>{p.version}</span>
                        {p.isActive && (
                          <span className="badge badge--approved" style={{ fontSize: '0.65rem' }}>
                            <Check size={9} /> Active
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                        {p.fileName} • {format(new Date(p.createdAt), 'MMM dd, yyyy')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.vectorStoreIngested ? (
                        <span className="text-xs" style={{ color: 'var(--green)' }}>
                          <Check size={11} style={{ display: 'inline', verticalAlign: -1 }} /> Indexed
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--amber)' }}>
                          <Clock size={11} style={{ display: 'inline', verticalAlign: -1 }} /> Pending
                        </span>
                      )}
                      {!p.isActive && (
                        <button className="btn btn--ghost btn--sm" onClick={() => handleActivate(p._id)}>
                          Activate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Current audit policy rules */}
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 4 }}>
          Current Audit Policy Rules
        </div>
        <p className="text-xs text-muted" style={{ marginBottom: 16 }}>
          These rules are enforced by the AI auditor when reviewing expense claims.
          {policies.some(p => p.isActive) && ' Additional rules from the uploaded policy document are also applied via semantic search.'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {/* Meal & Dining */}
          <div style={{ padding: '14px 16px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: '1.1rem' }}>🍽️</span>
              <span className="text-sm" style={{ fontWeight: 600 }}>Meals & Dining</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <li>Daily meal limit: <strong>₹1,500</strong> (domestic) / <strong>$80</strong> (international)</li>
              <li>Business purpose must be stated for meals above ₹750</li>
              <li>Alcohol expenses are <strong>not reimbursable</strong></li>
              <li>Team meals require attendee names for groups &gt; 4</li>
            </ul>
          </div>

          {/* Travel */}
          <div style={{ padding: '14px 16px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: '1.1rem' }}>✈️</span>
              <span className="text-sm" style={{ fontWeight: 600 }}>Travel & Transport</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <li>Economy class for flights under 4 hours</li>
              <li>Taxi/ride-share requires pickup & drop location</li>
              <li>Mileage reimbursement: <strong>₹9/km</strong> for personal vehicle</li>
              <li>Rental cars require prior manager approval</li>
            </ul>
          </div>

          {/* Accommodation */}
          <div style={{ padding: '14px 16px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: '1.1rem' }}>🏨</span>
              <span className="text-sm" style={{ fontWeight: 600 }}>Accommodation</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <li>Nightly limit: <strong>₹5,000</strong> (tier-2 cities) / <strong>₹8,000</strong> (metros)</li>
              <li>International: up to <strong>$200/night</strong></li>
              <li>Stays above limit require <strong>prior approval</strong></li>
              <li>Laundry/minibar charges are <strong>not covered</strong></li>
            </ul>
          </div>

          {/* General */}
          <div style={{ padding: '14px 16px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: '1.1rem' }}>📋</span>
              <span className="text-sm" style={{ fontWeight: 600 }}>General Rules</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <li>Receipts must be submitted within <strong>30 days</strong></li>
              <li>Claims without valid receipt images are <strong>auto-flagged</strong></li>
              <li>Duplicate receipts are automatically <strong>rejected</strong></li>
              <li>Amounts exceeding <strong>2x category average</strong> trigger anomaly review</li>
            </ul>
          </div>

          {/* Anomaly Detection */}
          <div style={{ padding: '14px 16px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: '1.1rem' }}>🔍</span>
              <span className="text-sm" style={{ fontWeight: 600 }}>AI Anomaly Detection</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <li>Z-score analysis against historical employee spending</li>
              <li>Claims &gt; 2 standard deviations from mean are <strong>flagged</strong></li>
              <li>Weekend/holiday expense patterns are reviewed</li>
              <li>Cross-validation: 5-point sanity check on AI extraction</li>
            </ul>
          </div>

          {/* Currency & Tax */}
          <div style={{ padding: '14px 16px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: '1.1rem' }}>💱</span>
              <span className="text-sm" style={{ fontWeight: 600 }}>Currency & Tax</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <li>International expenses auto-converted to <strong>INR</strong></li>
              <li>Exchange rates sourced from ExchangeRate-API (live)</li>
              <li>GST amounts separated for Input Tax Credit (ITC)</li>
              <li>Currency-scaled amount validation (₹ vs $ vs € ranges)</li>
            </ul>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
