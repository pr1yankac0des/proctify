import { AlertTriangle, Loader2, LogIn, Mail, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useStudent } from '../context/StudentContext'
import { api } from '../lib/api'

type AuthMode = 'signup' | 'login' | 'verify'

interface StudentAuthViewProps {
  onAuthenticated: () => void
}

export function StudentAuthView({ onAuthenticated }: StudentAuthViewProps) {
  const { setStudent } = useStudent()
  const [mode, setMode] = useState<AuthMode>('signup')
  const [fullName, setFullName] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const resetMessages = () => {
    setError('')
    setInfo('')
    setDevCode(null)
  }

  const handleSignup = async () => {
    resetMessages()
    if (!fullName.trim() || !registrationNumber.trim() || !email.trim()) {
      setError('All fields are required.')
      return
    }
    setLoading(true)
    try {
      const res = await api.signup({ fullName, registrationNumber, email })
      setInfo(res.message)
      if (res.devCode) setDevCode(res.devCode)
      setMode('verify')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign up failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    resetMessages()
    if (!registrationNumber.trim() || !email.trim()) {
      setError('Registration number and email are required.')
      return
    }
    setLoading(true)
    try {
      const res = await api.login({ registrationNumber, email })
      if (res.requiresVerification) {
        setInfo(res.message || 'Please verify your email.')
        if (res.devCode) setDevCode(res.devCode)
        setMode('verify')
      } else if (res.student) {
        setStudent(res.student)
        onAuthenticated()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    resetMessages()
    if (!email.trim() || !code.trim()) {
      setError('Email and verification code are required.')
      return
    }
    setLoading(true)
    try {
      const res = await api.verify({ email, code })
      setStudent(res.student)
      onAuthenticated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    resetMessages()
    setLoading(true)
    try {
      const res = await api.resendCode({ registrationNumber, email })
      setInfo(res.message)
      if (res.devCode) setDevCode(res.devCode)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend code.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-sm border border-paper-200 px-4 py-2.5 outline-none focus:border-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-50 dark:focus:border-paper-200'
  const labelClass = 'mb-1.5 block text-sm font-medium text-ink-700 dark:text-paper-200'

  return (
    <div className="animate-fade-in mx-auto max-w-md px-4 py-8">
      <div className="border border-paper-200 bg-white p-6 dark:border-ink-700 dark:bg-ink-dark-surface">
        <div className="eyebrow">Candidate access</div>
        <h2 className="font-serif mt-2 text-xl font-medium text-ink-950 dark:text-paper-50">
          {mode === 'verify' ? 'Verify your email' : mode === 'login' ? 'Candidate login' : 'Candidate registration'}
        </h2>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">
          Authenticate with your registration number and email before taking the assessment.
        </p>

        {mode !== 'verify' && (
          <div className="mt-4 flex border border-paper-200 dark:border-ink-700">
            <button
              type="button"
              onClick={() => { setMode('signup'); resetMessages() }}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors duration-150 ${
                mode === 'signup'
                  ? 'bg-ink-950 text-paper-50 dark:bg-paper-50 dark:text-ink-950'
                  : 'text-ink-500 dark:text-ink-300'
              }`}
            >
              <UserPlus className="h-4 w-4" />
              Sign up
            </button>
            <button
              type="button"
              onClick={() => { setMode('login'); resetMessages() }}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors duration-150 ${
                mode === 'login'
                  ? 'bg-ink-950 text-paper-50 dark:bg-paper-50 dark:text-ink-950'
                  : 'text-ink-500 dark:text-ink-300'
              }`}
            >
              <LogIn className="h-4 w-4" />
              Login
            </button>
          </div>
        )}

        <div className="mt-5 space-y-4">
          {mode === 'signup' && (
            <div>
              <label className={labelClass}>Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
                placeholder="Your full name"
              />
            </div>
          )}

          {mode !== 'verify' && (
            <>
              <div>
                <label className={labelClass}>Registration number</label>
                <input
                  type="text"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  className={`${inputClass} font-mono`}
                  placeholder="e.g. REG2024001"
                />
              </div>
              <div>
                <label className={labelClass}>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@university.edu"
                />
              </div>
            </>
          )}

          {mode === 'verify' && (
            <>
              <div className="flex items-center gap-2 border border-paper-200 bg-paper-100 p-3 text-sm text-ink-700 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-200">
                <Mail className="h-4 w-4 shrink-0 text-brass-600 dark:text-brass-100" />
                Enter the 6-digit code sent to <strong>{email}</strong>
              </div>
              <div>
                <label className={labelClass}>Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className={`${inputClass} text-center font-mono text-2xl tracking-[0.5em]`}
                  placeholder="000000"
                />
              </div>
            </>
          )}

          {error && (
            <p className="animate-shake flex items-center gap-1.5 border border-signal-600 bg-signal-50 px-3 py-2 text-sm text-signal-700 dark:border-signal-600 dark:bg-signal-100/10 dark:text-signal-100">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          {info && <p className="text-sm text-verify-700 dark:text-verify-600">{info}</p>}
          {devCode && (
            <div className="border border-brass-600 bg-brass-50 p-3 dark:border-brass-600 dark:bg-brass-100/10">
              <p className="text-xs font-medium text-brass-700 dark:text-brass-100">
                Dev mode — SMTP not configured. Your code:
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-brass-700 dark:text-brass-100">
                {devCode}
              </p>
            </div>
          )}

          {mode === 'signup' && (
            <button
              type="button"
              onClick={handleSignup}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-ink-950 py-3 font-medium text-paper-50 transition-colors duration-150 hover:bg-ink-700 disabled:opacity-60 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign up and send code
            </button>
          )}
          {mode === 'login' && (
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-ink-950 py-3 font-medium text-paper-50 transition-colors duration-150 hover:bg-ink-700 disabled:opacity-60 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Login
            </button>
          )}
          {mode === 'verify' && (
            <>
              <button
                type="button"
                onClick={handleVerify}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-sm bg-ink-950 py-3 font-medium text-paper-50 transition-colors duration-150 hover:bg-ink-700 disabled:opacity-60 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Verify email
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="w-full text-sm text-brass-700 hover:underline dark:text-brass-100"
              >
                Resend verification code
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
