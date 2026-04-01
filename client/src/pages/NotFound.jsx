import { Link } from 'react-router-dom'
import { ArrowLeft, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="not-found">
      <div className="not-found__code">404</div>
      <h2>Page not found</h2>
      <p>The page you're looking for doesn't exist or has been moved.</p>
      <div className="flex gap-3" style={{ justifyContent: 'center' }}>
        <Link to="/" className="btn btn--primary">
          <Home size={16} /> Go Home
        </Link>
        <button className="btn btn--secondary" onClick={() => window.history.back()}>
          <ArrowLeft size={16} /> Go Back
        </button>
      </div>
    </div>
  )
}
