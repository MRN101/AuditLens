import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FolderOpen, Plane, Home, Calendar, MapPin, Loader2, CheckCircle2, AlertTriangle, FileImage, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { tripsAPI } from '../../services/api'
import { formatBase } from '../../utils/currencyUtils'

export default function BatchUpload() {
  const [step, setStep] = useState(0) // 0: trip info, 1: upload files, 2: processing, 3: done
  const [tripName, setTripName] = useState('')
  const [tripType, setTripType] = useState('domestic')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [businessPurpose, setBusinessPurpose] = useState('')
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [tripId, setTripId] = useState(null)

  const onDrop = useCallback((accepted) => {
    setFiles(prev => [...prev, ...accepted].slice(0, 20))
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/pdf': [] },
    maxFiles: 20,
    maxSize: 10 * 1024 * 1024,
  })

  const removeFile = (i) => setFiles(prev => prev.filter((_, idx) => idx !== i))

  const handleCreateTrip = async (e) => {
    e.preventDefault()
    if (!tripName.trim()) return toast.error('Enter a trip name')
    if (!startDate || !endDate) return toast.error('Select trip dates')

    setLoading(true)
    try {
      const { data } = await tripsAPI.create({
        tripName: tripName.trim(), tripType, destination: destination.trim(),
        startDate, endDate,
      })
      setTripId(data.trip._id)
      setStep(1)
      toast.success('Trip created! Now upload your receipts.')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create trip')
    }
    setLoading(false)
  }

  const handleUploadReceipts = async () => {
    if (!files.length) return toast.error('Add at least one receipt')
    setLoading(true)
    setStep(2)

    const formData = new FormData()
    files.forEach(f => formData.append('receipts', f))
    formData.append('businessPurpose', businessPurpose.trim() || tripName)

    try {
      const { data } = await tripsAPI.uploadReceipts(tripId, formData)
      setResults(data)
      setStep(3)
      toast.success(`${data.results.length} receipts uploaded!`)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed')
      setStep(1)
    }
    setLoading(false)
  }

  const reset = () => {
    setStep(0); setTripName(''); setTripType('domestic'); setDestination('')
    setStartDate(''); setEndDate(''); setBusinessPurpose('')
    setFiles([]); setResults(null); setTripId(null)
  }

  return (
    <div>
      <div className="page-header">
        <h2>Batch Upload</h2>
        <p>Upload multiple receipts for a trip at once</p>
      </div>

      {/* Progress */}
      <div className="progress-steps mb-6">
        {['Trip Details', 'Upload Receipts', 'Processing', 'Complete'].map((s, i) => (
          <div key={i} className="flex items-center">
            {i > 0 && <div className="progress-step__line" style={{ background: step >= i ? 'var(--accent)' : undefined }} />}
            <div className={`progress-step ${step === i ? 'progress-step--active' : step > i ? 'progress-step--done' : ''}`}>
              <div className="progress-step__dot">{step > i ? '✓' : i + 1}</div>
              <div style={{ fontWeight: 550 }}>{s}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Step 0: Trip Info */}
      {step === 0 && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>Trip Information</div>
          <form onSubmit={handleCreateTrip}>
            <div className="form-group">
              <label className="form-label">Trip Name</label>
              <input className="form-input" placeholder="e.g. Mumbai Client Visit — March 2026" value={tripName} onChange={e => setTripName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Trip Type</label>
              <div className="flex gap-3">
                <button type="button" className={`btn ${tripType === 'domestic' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTripType('domestic')}>
                  <Home size={14} /> Domestic 🇮🇳
                </button>
                <button type="button" className={`btn ${tripType === 'international' ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTripType('international')}>
                  <Plane size={14} /> International 🌍
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label"><MapPin size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Destination</label>
              <input className="form-input" placeholder="e.g. Mumbai, Delhi" value={destination} onChange={e => setDestination(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label"><Calendar size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Start Date</label>
                <input className="form-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">End Date</label>
                <input className="form-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Default Business Purpose (for all receipts)</label>
              <textarea className="form-textarea" placeholder="e.g. Client meetings and site visits" value={businessPurpose} onChange={e => setBusinessPurpose(e.target.value)} />
            </div>
            <button type="submit" className="btn btn--primary w-full" disabled={loading}>
              {loading ? <><Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> Creating...</> : <><FolderOpen size={14} /> Create Trip</>}
            </button>
          </form>
        </div>
      )}

      {/* Step 1: Upload files */}
      {step === 1 && (
        <div className="card" style={{ maxWidth: 700 }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 16 }}>
            Upload Receipts <span className="text-xs text-muted">({files.length}/20)</span>
          </div>
          <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dropzone--active' : ''}`} style={{ marginBottom: 16 }}>
            <input {...getInputProps()} />
            <Upload className="dropzone__icon" />
            <p className="dropzone__text">{isDragActive ? 'Drop files here...' : 'Drag & drop up to 20 receipts'}</p>
            <p className="dropzone__hint">JPG, PNG or PDF — 10MB each</p>
          </div>

          {files.length > 0 && (
            <div style={{ marginBottom: 16, maxHeight: 240, overflowY: 'auto' }}>
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between" style={{
                  padding: '8px 12px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)', marginBottom: 4,
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div className="flex items-center gap-3">
                    <FileImage size={16} style={{ color: 'var(--text-muted)' }} />
                    <div>
                      <div className="text-sm truncate" style={{ fontWeight: 500, maxWidth: 300 }}>{f.name}</div>
                      <div className="text-xs text-muted">{(f.size / 1024).toFixed(0)} KB</div>
                    </div>
                  </div>
                  <button className="btn btn--ghost btn--icon" onClick={() => removeFile(i)}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <button className="btn btn--primary w-full" onClick={handleUploadReceipts} disabled={loading || !files.length}>
            <Upload size={14} /> Upload {files.length} Receipt{files.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* Step 2: Processing */}
      {step === 2 && (
        <div className="card" style={{ maxWidth: 500, textAlign: 'center', padding: 48 }}>
          <Loader2 size={48} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>Processing {files.length} receipts...</div>
          <p className="text-sm text-muted">Each receipt is being analyzed by AI. This may take a moment.</p>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 3 && results && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
            <CheckCircle2 size={24} style={{ color: 'var(--green)' }} />
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>Trip Submitted Successfully!</div>
          </div>
          <p className="text-sm text-secondary" style={{ marginBottom: 16 }}>{results.message}</p>

          <div style={{ marginBottom: 16 }}>
            {results.results?.map((r, i) => (
              <div key={i} className="flex items-center justify-between" style={{
                padding: '8px 12px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)', marginBottom: 4,
              }}>
                <span className="text-sm">{r.fileName}</span>
                <div className="flex items-center gap-2">
                  {r.isDuplicate && <AlertTriangle size={12} style={{ color: 'var(--amber)' }} />}
                  <span className="text-xs mono text-muted">{r.claimId?.slice(-8)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <a href="/claims/history" className="btn btn--primary flex-1">View Claims</a>
            <button className="btn btn--secondary flex-1" onClick={reset}>New Trip</button>
          </div>
        </div>
      )}
    </div>
  )
}
