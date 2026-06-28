import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

const ADMIN_TOKEN_KEY = 'academyflow_admin_token'

interface AdminContextValue {
  token: string | null
  login: (token: string) => void
  logout: () => void
  isAdmin: boolean
}

const AdminContext = createContext<AdminContextValue | null>(null)

function loadToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY)
  } catch {
    return null
  }
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(loadToken)

  const login = useCallback((t: string) => {
    setToken(t)
    sessionStorage.setItem(ADMIN_TOKEN_KEY, t)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    sessionStorage.removeItem(ADMIN_TOKEN_KEY)
  }, [])

  return (
    <AdminContext.Provider value={{ token, login, logout, isAdmin: !!token }}>
      {children}
    </AdminContext.Provider>
  )
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider')
  return ctx
}
