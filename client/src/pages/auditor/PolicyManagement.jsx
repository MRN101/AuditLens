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

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
