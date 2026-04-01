import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

// Attach token on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Auth
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
}

// Claims (Employee)
export const claimsAPI = {
  upload: (formData) =>
    api.post('/claims/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    }),
  getMyClaims: (params) => api.get('/claims', { params }),
  getClaim: (id) => api.get(`/claims/${id}`),
  deleteClaim: (id) => api.delete(`/claims/${id}`),
  reaudit: (id) => api.post(`/claims/${id}/reaudit`),
}

// Auditor
export const auditorAPI = {
  getClaims: (params) => api.get('/auditor/claims', { params }),
  overrideClaim: (id, data) => api.patch(`/auditor/claims/${id}/override`, data),
  bulkOverride: (data) => api.post('/auditor/claims/bulk-override', data),
  getStats: () => api.get('/auditor/stats'),
  getEmployees: () => api.get('/auditor/employees'),
}

// Policy
export const policyAPI = {
  upload: (formData) =>
    api.post('/policy/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  list: () => api.get('/policy'),
  activate: (id) => api.post(`/policy/${id}/activate`),
  delete: (id) => api.delete(`/policy/${id}`),
}

// Analytics
export const analyticsAPI = {
  overview: (params) => api.get('/analytics/overview', { params }),
  topOffenders: () => api.get('/analytics/top-offenders'),
  my: () => api.get('/analytics/my'),
}

export default api
