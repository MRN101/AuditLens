import { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileImage, X, Calendar, AlignLeft, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Home, Plane, IndianRupee } from 'lucide-react'
import toast from 'react-hot-toast'
import { claimsAPI, budgetAPI } from '../../services/api'
import { formatBase, BASE_SYMBOL } from '../../utils/currencyUtils'

const STEPS = [
  { label: 'Upload', desc: 'Drop your receipt' },
  { label: 'Details', desc: 'Date & purpose' },
  { label: 'Processing', desc: 'AI audit in progress' },
  { label: 'Done', desc: 'Result ready' },
]

export default function UploadReceipt() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [businessPurpose, setBusinessPurpose] = useState('')
  const [claimedDate, setClaimedDate] = useState('')
  const [tripType, setTripType] = useState('domestic')
  const [claimedAmount, setClaimedAmount] = useState('')
  const [claimedCurrency, setClaimedCurrency] = useState('INR')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [step, setStep] = useState(0)
  const [budget, setBudget] = useState(null)

  // Load budget on mount
  useEffect(() => {
    budgetAPI.getMy().then(({ data }) => setBudget(data)).catch(() => {})
  }, [])

  const onDrop = useCallback((accepted) => {
    if (accepted.length > 0) {
      const f = accepted[0]
      setFile(f)
      setResult(null)
      setStep(1)
      if (f.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => setPreview(reader.result)
        reader.readAsDataURL(f)
      } else {
        setPreview(null)
      }
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/pdf': [] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  })

  const removeFile = () => { setFile(null); setPreview(null); setResult(null); setStep(0) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return toast.error('Upload a receipt first')
    if (!claimedDate) return toast.error('Select the expense date')
    if (!businessPurpose.trim()) return toast.error('Provide a business purpose')
    if (businessPurpose.trim().length < 5) return toast.error('Business purpose must be at least 5 characters')

    setLoading(true)
    setStep(2)
    const formData = new FormData()
    formData.append('receipt', file)
    formData.append('claimedDate', claimedDate)
    formData.append('businessPurpose', businessPurpose.trim())
    formData.append('tripType', tripType)
    if (claimedAmount) {
      formData.append('claimedAmount', claimedAmount)
      formData.append('claimedCurrency', claimedCurrency)
    }

    try {
      const { data } = await claimsAPI.upload(formData)
      setResult(data)
      setStep(3)
      toast.success(data.message || 'Claim submitted!')
      setFile(null)
      setPreview(null)
      setBusinessPurpose('')
      setClaimedDate('')
      setClaimedAmount('')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed')
      setStep(1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Submit Expense</h2>
        <p>Upload your receipt and provide context for the claim</p>
      </div>

      {/* Progress steps */}
      <div className="progress-steps mb-6">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center">
            {i > 0 && (
              <div className="progress-step__line" style={{ background: step >= i ? 'var(--accent)' : undefined }} />
            )}
            <div className={`progress-step ${step === i ? 'progress-step--active' : step > i ? 'progress-step--done' : ''}`}>
              <div className="progress-step__dot">{step > i ? '✓' : i + 1}</div>
              <div>
                <div style={{ fontWeight: 550 }}>{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
        {/* Main form */}
        <form onSubmit={handleSubmit}>
          {/* Dropzone */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Receipt</div>
                <div className="text-xs text-muted" style={{ marginTop: 2 }}>JPG, PNG or PDF up to 10MB</div>
              </div>
              {file && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={removeFile}>
                  <X size={14} /> Remove
                </button>
              )}
            </div>

            {!file ? (
              <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dropzone--active' : ''}`}>
                <input {...getInputProps()} />
                <Upload className="dropzone__icon" />
                <p className="dropzone__text">
                  {isDragActive ? 'Drop it here...' : 'Drag & drop your receipt, or click to browse'}
                </p>
                <p className="dropzone__hint">The system will auto-extract merchant, date, amount & currency</p>
              </div>
            ) : (
              <div className="dropzone__preview">
                {preview ? (
                  <img src={preview} alt="Receipt" />
                ) : (
                  <div style={{ width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)' }}>
                    <FileImage size={24} style={{ color: 'var(--text-muted)' }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm truncate" style={{ fontWeight: 500 }}>{file.name}</div>
                  <div className="text-xs text-muted">{(file.size / 1024).toFixed(0)} KB</div>
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="card">
            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>Claim Details</div>

            {/* Trip Type */}
            <div className="form-group">
              <label className="form-label">Trip Type</label>
              <div className="flex gap-3">
                <button type="button" className={`btn btn--sm ${tripType === 'domestic' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTripType('domestic')}>
                  <Home size={13} /> Domestic 🇮🇳
                </button>
                <button type="button" className={`btn btn--sm ${tripType === 'international' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTripType('international')}>
                  <Plane size={13} /> International 🌍
                </button>
              </div>
              <div className="form-hint">
                {tripType === 'international' ? 'International limits apply. Receipt will be converted to ₹' : 'Standard domestic expense limits apply'}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="claim-date">
                <Calendar size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                Expense date
              </label>
              <input
                id="claim-date"
                className="form-input"
                type="date"
                value={claimedDate}
                onChange={(e) => setClaimedDate(e.target.value)}
              />
              <div className="form-hint">Must match the date on your receipt</div>
            </div>

            {/* Optional claimed amount */}
            <div className="form-group">
              <label className="form-label">
                <IndianRupee size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                Expected Amount <span className="text-muted">(optional)</span>
              </label>
              <div className="flex gap-3">
                <select className="form-select" value={claimedCurrency} onChange={e => setClaimedCurrency(e.target.value)} style={{ width: 90 }}>
                  <option value="INR">₹ INR</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                  <option value="GBP">£ GBP</option>
                  <option value="SGD">S$ SGD</option>
                  <option value="AED">AED</option>
                </select>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={claimedAmount}
                  onChange={e => setClaimedAmount(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
              <div className="form-hint">Enter the amount if you know it — system will cross-validate with OCR</div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="claim-purpose">
                <AlignLeft size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
                Business purpose
              </label>
              <textarea
                id="claim-purpose"
                className="form-textarea"
                placeholder="e.g. Client dinner meeting with Acme Corp team to discuss Q3 partnership terms"
                value={businessPurpose}
                onChange={(e) => setBusinessPurpose(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <div className="form-hint">Be specific — this is cross-referenced against company policy</div>
                <div className="text-xs" style={{ color: businessPurpose.length < 5 ? 'var(--text-muted)' : 'var(--green)' }}>
                  {businessPurpose.length}/5 min
                </div>
              </div>
            </div>

            <button
              id="submit-claim"
              type="submit"
              className="btn btn--primary btn--lg w-full"
              disabled={loading || !file}
            >
              {loading ? (
                <><Loader2 size={16} style={{ animation: 'spin 0.6s linear infinite' }} /> Processing...</>
              ) : (
                <><Upload size={16} /> Submit Claim</>
              )}
            </button>
          </div>
        </form>

        {/* Side panel */}
        <div className="flex flex-col gap-4">
          {result && (
            <div className="card" style={{ borderColor: result.isDuplicate ? 'var(--amber)' : 'var(--green)' }}>
              <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
                {result.isDuplicate ? (
                  <AlertTriangle size={20} style={{ color: 'var(--amber)' }} />
                ) : (
                  <CheckCircle2 size={20} style={{ color: 'var(--green)' }} />
                )}
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {result.isDuplicate ? 'Duplicate Warning' : 'Claim Submitted'}
                </span>
              </div>
              <p className="text-sm text-secondary">{result.message}</p>
              <div className="text-xs text-muted" style={{ marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                ID: {result.claimId}
              </div>
              <a href="/claims/history" className="btn btn--secondary btn--sm w-full" style={{ marginTop: 12 }}>
                View in My Claims <ArrowRight size={14} />
              </a>
            </div>
          )}

          {/* Budget sidebar */}
          {budget && (
            <div className="card">
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 12 }}>
                Monthly Budget <span className="text-xs text-muted">({budget.summary?.month})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(budget.budget || []).filter(b => b.spent > 0 || b.percentage > 0).slice(0, 5).map(b => (
                  <div key={b.category}>
                    <div className="flex items-center justify-between text-xs" style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>{b.category}</span>
                      <span className="text-muted">{formatBase(b.spent)} / {formatBase(b.limit)}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2, width: `${Math.min(100, b.percentage)}%`,
                        background: b.status === 'exceeded' ? 'var(--red)' : b.status === 'warning' ? 'var(--amber)' : 'var(--green)',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 12 }}>How it works</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { n: '1', t: 'Upload', d: 'Drop your receipt image or PDF' },
                { n: '2', t: 'AI Reads', d: 'OCR extracts merchant, date, and amount' },
                { n: '3', t: 'Policy Check', d: 'Compared against company expense policy' },
                { n: '4', t: 'Result', d: 'Approved, flagged, or sent for review' },
              ].map((s) => (
                <div key={s.n} className="flex gap-3">
                  <div style={{
                    width: 28, height: 28, borderRadius: 'var(--radius-full)',
                    background: 'var(--accent-subtle)', color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                    border: '1px solid var(--accent-muted)',
                  }}>{s.n}</div>
                  <div>
                    <div className="text-sm" style={{ fontWeight: 550 }}>{s.t}</div>
                    <div className="text-xs text-muted">{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .page-container > div > div[style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
          .progress-steps { overflow-x: auto; }
        }
      `}</style>
    </div>
  )
}
