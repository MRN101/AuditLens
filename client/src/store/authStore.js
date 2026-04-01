import { create } from 'zustand'

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,
  isAuthed: !!localStorage.getItem('token'),

  login: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('token', token)
    set({ user, token, isAuthed: true })
  },

  logout: () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    set({ user: null, token: null, isAuthed: false })
  },

  updateUser: (updates) => {
    set((state) => {
      const updated = { ...state.user, ...updates }
      localStorage.setItem('user', JSON.stringify(updated))
      return { user: updated }
    })
  },
}))

export default useAuthStore
