import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import useAuthStore from './store/authStore'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import AppShell from './components/AppShell'
import UploadReceipt from './pages/employee/UploadReceipt'
import MyClaims from './pages/employee/MyClaims'
import Dashboard from './pages/auditor/Dashboard'
import Analytics from './pages/auditor/Analytics'
import PolicyManagement from './pages/auditor/PolicyManagement'
import NotFound from './pages/NotFound'

function ProtectedRoute({ children, roles }) {
  const { isAuthed, user } = useAuthStore()
  if (!isAuthed) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user?.role)) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { isAuthed, user } = useAuthStore()
  const defaultPath = user?.role === 'auditor' || user?.role === 'admin' ? '/auditor/dashboard' : '/claims/upload'

  return (
    <Routes>
      <Route path="/login" element={isAuthed ? <Navigate to={defaultPath} /> : <Login />} />
      <Route path="/register" element={isAuthed ? <Navigate to={defaultPath} /> : <Register />} />
      
      <Route path="/" element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      }>
        {/* Employee routes */}
        <Route index element={<Navigate to={defaultPath} replace />} />
        <Route path="claims/upload" element={
          <ProtectedRoute roles={['employee']}><UploadReceipt /></ProtectedRoute>
        } />
        <Route path="claims/history" element={
          <ProtectedRoute roles={['employee']}><MyClaims /></ProtectedRoute>
        } />
        
        {/* Auditor routes */}
        <Route path="auditor/dashboard" element={
          <ProtectedRoute roles={['auditor', 'admin']}><Dashboard /></ProtectedRoute>
        } />
        <Route path="auditor/analytics" element={
          <ProtectedRoute roles={['auditor', 'admin']}><Analytics /></ProtectedRoute>
        } />
        <Route path="auditor/policy" element={
          <ProtectedRoute roles={['auditor', 'admin']}><PolicyManagement /></ProtectedRoute>
        } />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#152a24',
            color: '#d5ede4',
            border: '1px solid #264035',
            fontSize: '0.85rem',
            fontFamily: "'DM Sans', sans-serif",
          },
        }}
      />
      <AppRoutes />
    </BrowserRouter>
  )
}
