import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  FileQuestion,
  Loader2,
  LogOut,
  Play,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { ExamPreflight } from '../components/ExamPreflight'
import { Modal } from '../components/Modal'
import { useStudent } from '../context/StudentContext'
import { api } from '../lib/api'
import {
  formatScheduleRange,
  getScheduleMessage,
  getScheduleStatus,
} from '../lib/schedule'
import type { ExamAttempt, Submission, Test } from '../types'
import { StudentAuthView } from './StudentAuthView'

interface StudentTestViewProps {
  testId: string
  onStartTest: (test: Test, attempt: ExamAttempt) => void
  onViewResults: (submission: Submission, test: Test) => void
}

export function StudentTestView({ testId, onStartTest, onViewResults }: StudentTestViewProps) {
  const { student, logout } = useStudent()
  const [test, setTest] = useState<Test | null>(null)
  const [existingSubmission, setExistingSubmission] = useState<Submission | null>(null)
  const [existingAttempt, setExistingAttempt] = useState<ExamAttempt | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const t = await api.getTest(testId)
        if (cancelled) return
        setTest(t)
        if (student) {
          const [subs, attempt] = await Promise.all([
            api.getStudentSubmissions({ testId, studentId: student.id }),
            api.getAttempt(t.id),
          ])
          if (!cancelled) {
            setExistingSubmission(subs[0] ?? null)
            setExistingAttempt(attempt)
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load test.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [testId, student])

  if (!student) {
    return <StudentAuthView onAuthenticated={() => {}} />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-brass-600" />
      </div>
    )
  }

  if (error || !test) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-signal-600 dark:text-signal-100" />
        <h2 className="font-serif mt-4 text-xl font-medium text-ink-950 dark:text-paper-50">
          Test not found
        </h2>
        <p className="mt-2 text-ink-700 dark:text-paper-200">
          {error || 'This test link is invalid. Please check with your instructor.'}
        </p>
      </div>
    )
  }

  const scheduleStatus = getScheduleStatus(test, now)
  const canStart = !existingSubmission && (scheduleStatus === 'open' || Boolean(existingAttempt))

  return (
    <div className="animate-fade-in mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-ink-700 dark:text-paper-200">
          Signed in as <strong className="text-ink-950 dark:text-paper-50">{student.fullName}</strong>
          <span className="ml-2 font-mono text-xs">({student.registrationNumber})</span>
        </p>
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700 dark:hover:text-paper-200"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>

      <div className="border border-paper-200 bg-white p-6 dark:border-ink-700 dark:bg-ink-dark-surface sm:p-8">
        <span className="font-mono text-xs text-brass-700 dark:text-brass-100">{test.code}</span>
        <h2 className="font-serif mt-1 text-2xl font-medium text-ink-950 dark:text-paper-50">{test.title}</h2>
        <p className="mt-3 text-ink-700 dark:text-paper-200">{test.description}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 border border-paper-200 bg-paper-100 px-3 py-2 dark:border-ink-700 dark:bg-ink-dark-bg">
            <Clock className="h-4 w-4 text-ink-300 dark:text-ink-500" />
            <span className="text-sm text-ink-700 dark:text-paper-200">{test.timeLimitMinutes} min time limit</span>
          </div>
          <div className="flex items-center gap-2 border border-paper-200 bg-paper-100 px-3 py-2 dark:border-ink-700 dark:bg-ink-dark-bg">
            <FileQuestion className="h-4 w-4 text-ink-300 dark:text-ink-500" />
            <span className="text-sm text-ink-700 dark:text-paper-200">{test.questions.length} questions</span>
          </div>
        </div>

        <div className="mt-4 border border-paper-200 p-4 dark:border-ink-700">
          <div className="flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-paper-200">
            <Calendar className="h-4 w-4 text-brass-600 dark:text-brass-100" />
            Scheduled window
          </div>
          <p className="mt-1 font-mono text-sm text-ink-700 dark:text-paper-200">
            {formatScheduleRange(test)}
          </p>
          <p
            className={`mt-2 text-sm ${
              scheduleStatus === 'open'
                ? 'text-verify-700 dark:text-verify-600'
                : scheduleStatus === 'upcoming'
                  ? 'text-brass-700 dark:text-brass-100'
                  : 'text-signal-700 dark:text-signal-100'
            }`}
          >
            {getScheduleMessage(scheduleStatus, test)}
          </p>
        </div>

        {existingSubmission ? (
          <div className="mt-6 border border-verify-700 bg-verify-50 p-4 dark:border-verify-600 dark:bg-verify-100/10">
            <div className="flex items-center gap-2 text-verify-700 dark:text-verify-600">
              <CheckCircle2 className="h-5 w-5" />
              <p className="font-semibold">You have already completed this test.</p>
            </div>
            <p className="mt-1 text-sm text-verify-700 dark:text-verify-600">
              Score: {existingSubmission.score}/{existingSubmission.totalQuestions} — only one attempt
              is permitted.
            </p>
            <button
              type="button"
              onClick={() => onViewResults(existingSubmission, test)}
              className="mt-3 rounded-sm bg-verify-700 px-4 py-2 text-sm font-medium text-paper-50 hover:bg-verify-600"
            >
              View your results
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!canStart}
            onClick={() => setConfirmOpen(true)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm bg-ink-950 py-3 font-medium text-paper-50 transition-colors duration-150 hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200"
          >
            <Play className="h-4 w-4" />
            {existingAttempt
              ? 'Resume saved attempt'
              : scheduleStatus === 'upcoming'
              ? 'Not yet available'
              : scheduleStatus === 'closed'
                ? 'Window closed'
                : 'Start test'}
          </button>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Exam readiness check" wide>
        <ExamPreflight
          apiBaseUrl={(import.meta.env.VITE_API_URL as string) || '/api'}
          voiceTranscriptionEnabled={test.enableVoiceTranscription === true}
          onEnter={async () => {
            const attempt = existingAttempt ?? await api.startAttempt(test.id)
            setExistingAttempt(attempt)
            setConfirmOpen(false)
            onStartTest(test, attempt)
          }}
        />
      </Modal>
    </div>
  )
}
