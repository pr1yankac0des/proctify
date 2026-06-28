import { Lock, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useAdmin } from '../context/AdminContext'
import { api } from '../lib/api'

export function AdminLoginView() {
  const { login } = useAdmin()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) {
      setError('Password is required.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await api.adminLogin(password)
      login(res.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-50 px-4 dark:bg-ink-dark-bg">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <div className="eyebrow justify-center">Creator studio</div>
          <h1 className="font-serif mt-4 text-2xl font-medium text-ink-950 dark:text-paper-50">
            Proctify
          </h1>
        </div>

        <div className="border border-paper-200 bg-white p-8 dark:border-ink-700 dark:bg-ink-dark-surface">
          <div className="mb-6 flex items-center gap-3 border-b border-paper-200 pb-5 dark:border-ink-700">
            <div className="seal h-10 w-10 text-brass-600 dark:text-brass-100">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-semibold text-ink-950 dark:text-paper-50">Administrator access</h2>
              <p className="text-xs text-ink-500 dark:text-ink-300">Enter your password to continue</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-paper-200">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  autoComplete="current-password"
                  className="w-full rounded-sm border border-paper-200 bg-paper-50 px-4 py-3 pr-12 text-ink-950 placeholder-ink-300 outline-none focus:border-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-50 dark:placeholder-ink-500 dark:focus:border-paper-200"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-700 dark:text-ink-500 dark:hover:text-paper-200"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="animate-shake border border-signal-600 bg-signal-50 px-3 py-2 text-sm text-signal-700 dark:border-signal-600 dark:bg-signal-100/10 dark:text-signal-100">
                {error}
              </p>
            )}

            <button
              id="admin-login-btn"
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-ink-950 py-3 font-medium text-paper-50 transition-colors duration-150 hover:bg-ink-700 disabled:opacity-60 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-paper-50/30 border-t-paper-50 dark:border-ink-950/30 dark:border-t-ink-950" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {loading ? 'Authenticating…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 border-t border-paper-200 pt-4 text-center text-xs text-ink-500 dark:border-ink-700 dark:text-ink-300">
            Set via <span className="font-mono text-ink-700 dark:text-paper-200">ADMIN_PASSWORD</span> in <span className="font-mono text-ink-700 dark:text-paper-200">.env</span>
          </p>
        </div>
      </div>
    </div>
  )
}
