import { create } from 'zustand'

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token'),
  isAuthed: !!localStorage.getItem('token'),

  login: (userData) => {
    localStorage.setItem('token', userData.token)
    localStorage.setItem('user', JSON.stringify(userData))
    set({ user: userData, token: userData.token, isAuthed: true })
  },

  setUser: (userData) => {
    const current = JSON.parse(localStorage.getItem('user') || '{}')
    const merged = { ...current, ...userData }
    localStorage.setItem('user', JSON.stringify(merged))
    set({ user: merged })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ user: null, token: null, isAuthed: false })
  },
}))

export default useAuthStore
