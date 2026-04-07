import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Shield, Zap, Brain, FileSearch, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '../../services/api'
import useAuthStore from '../../store/authStore'

const FEATURES = [
  { icon: Brain, title: 'AI-Powered OCR', desc: 'Gemini extracts every field from receipts — merchant, items, tax, totals' },
  { icon: Shield, title: 'Policy Enforcement', desc: 'Auto-audits claims against your company expense policy in real-time' },
  { icon: Zap, title: 'Instant Processing', desc: 'Multi-pass pipeline processes receipts in under 20 seconds' },
  { icon: FileSearch, title: 'Fraud Detection', desc: 'Duplicate detection, math validation & anomaly flagging built-in' },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const navigate = useNavigate()
  const { login } = useAuthStore()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) return toast.error('All fields required')
    setLoading(true)
    try {
      const { data } = await authAPI.login({ email, password })
      login(data, data.token)
      toast.success(`Welcome back, ${data.name}`)
      navigate(data.role === 'employee' ? '/claims/upload' : '/auditor/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-layout">
      {/* Left: Hero panel */}
      <div className="auth-hero">
        <div className="auth-hero__content">
          <div className="auth-hero__badge">Enterprise Expense Intelligence</div>
          <h1 className="auth-hero__title">
            Smart Expense Auditing,<br />
            <span>Powered by AI</span>
          </h1>
          <p className="auth-hero__subtitle">
            AuditLens uses Gemini AI to automatically extract, validate, and audit expense claims — eliminating manual review and catching fraud before it costs you.
          </p>

          <div className="auth-hero__features">
            {FEATURES.map((f, i) => (
              <div key={i} className="auth-hero__feature" style={{ animationDelay: `${0.4 + i * 0.1}s` }}>
                <div className="auth-hero__feature-icon">
                  <f.icon size={16} />
                </div>
                <div>
                  <div className="auth-hero__feature-title">{f.title}</div>
                  <div className="auth-hero__feature-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative elements */}
        <div className="auth-hero__glow auth-hero__glow--1" />
        <div className="auth-hero__glow auth-hero__glow--2" />
      </div>

      {/* Right: Login form */}
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-card__logo">
            <h1>Audit<span>Lens</span></h1>
            <p>Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                id="login-email"
                className="form-input"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  className="form-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--icon"
                  onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={() => setRememberMe(!rememberMe)}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                />
                Remember me
              </label>
            </div>

            <button id="login-submit" className="btn btn--primary w-full btn--lg" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <span className="spinner" /> : <><span>Sign in</span> <ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="auth-card__footer">
            Don't have an account? <Link to="/register">Create one</Link>
          </div>

          <div className="demo-hint">
            <strong>Demo:</strong> Register as <code>Employee</code> or <code>Auditor</code> to explore different views
          </div>
        </div>
      </div>
    </div>
  )
}
