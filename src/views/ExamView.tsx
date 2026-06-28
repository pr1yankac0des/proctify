import { AlertTriangle, ChevronLeft, ChevronRight, Flag, Send, Shield } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CodeEditor } from '../components/CodeEditor'
import { Modal } from '../components/Modal'
import { CameraProctor } from '../components/CameraProctor'
import { AIProctorMonitor } from '../components/AIProctorMonitor'
import { AntiCameraOverlay } from '../components/AntiCameraOverlay'
import { useProctoring } from '../hooks/useProctoring'
import { api } from '../lib/api'
import { formatTimeRemaining } from '../lib/scoring'
import type { Dispatch, SetStateAction } from 'react'
import type { ExamSession, ProctorEvent, Test } from '../types'

const LABELS = ['A', 'B', 'C', 'D'] as const

interface ExamViewProps {
  test: Test
  session: ExamSession
  onUpdateSession: Dispatch<SetStateAction<ExamSession | null>>
  onSubmit: (session: ExamSession) => void
}

export function ExamView({ test, session, onUpdateSession, onSubmit }: ExamViewProps) {
  const [remaining, setRemaining] = useState(
    Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000))
  )
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'offline'>('saved')
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement)

  const latestSessionRef = useRef(session)
  latestSessionRef.current = session
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  const [lockoutCount, setLockoutCount] = useState(0)
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null)
  const [lockoutTimeLeft, setLockoutTimeLeft] = useState(0)

  useEffect(() => {
    if (!lockoutUntil) return
    const interval = setInterval(() => {
      const left = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000))
      setLockoutTimeLeft(left)
      if (left <= 0) {
        clearInterval(interval)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lockoutUntil])

  const enterFullscreen = () => {
    try {
      const doc = document.documentElement
      if (doc.requestFullscreen) {
        doc.requestFullscreen()
      } else if ((doc as any).webkitRequestFullscreen) {
        ;(doc as any).webkitRequestFullscreen()
      }
    } catch (e) {
      console.warn('Failed to enter fullscreen mode:', e)
    }
  }

  const addProctorEvent = useCallback(
    (event: ProctorEvent) => {
      onUpdateSession((prev) =>
        prev ? { ...prev, proctorEvents: [...prev.proctorEvents, event] } : prev
      )
    },
    [onUpdateSession]
  )

  const handleVideoRef = useCallback((ref: React.RefObject<HTMLVideoElement | null>) => {
    videoRef.current = ref.current
  }, [])

  const handleMediaEvent = useCallback((message: string) => {
    addProctorEvent({
      timestamp: new Date().toISOString(),
      message: `Media Proctor: ${message}`,
    })
  }, [addProctorEvent])

  const submittedRef = useRef(false)
  const submitOnce = useCallback((currentSession: ExamSession) => {
    if (submittedRef.current) return
    submittedRef.current = true
    onSubmit(currentSession)
  }, [onSubmit])

  const handleLockout = useCallback((reason: string) => {
    setLockoutUntil((current) => {
      if (current && Date.now() < current) return current

      let nextCount = 0
      setLockoutCount((prev) => {
        nextCount = prev + 1
        if (nextCount >= 3) {
          addProctorEvent({
            timestamp: new Date().toISOString(),
            message: `AUTO-SUBMIT: Multiple suspensions limit reached (3 infractions). Last trigger: ${reason}`,
          })
          submitOnce(latestSessionRef.current)
        } else {
          addProctorEvent({
            timestamp: new Date().toISOString(),
            message: `SUSPENSION ACTIVE: 3-minute cooldown (Infraction #${nextCount}). Trigger: ${reason}`,
          })
        }
        return nextCount
      })

      if (nextCount >= 3) return null
      return Date.now() + 180 * 1000
    })
  }, [addProctorEvent, submitOnce])

  useProctoring(true, addProctorEvent, handleLockout)

  useEffect(() => {
    submittedRef.current = false
  }, [session.startedAt])

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000))
      setRemaining(left)
      if (left <= 0 && !submittedRef.current) {
        submitOnce(latestSessionRef.current)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [session.expiresAt, submitOnce])

  useEffect(() => {
    if (submittedRef.current) return
    setSaveStatus('saving')
    const timeout = window.setTimeout(() => {
      api.saveAttempt(session)
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('offline'))
    }, 750)
    return () => window.clearTimeout(timeout)
  }, [session])

  const currentQ = test.questions[session.currentIndex]
  const selected = session.answers[session.currentIndex]
  const isFlagged = session.flaggedQuestions.includes(session.currentIndex)

  const setAnswer = (val: any) => {
    onUpdateSession((prev) => {
      if (!prev) return prev
      const answers = [...prev.answers]
      answers[prev.currentIndex] = val
      return { ...prev, answers }
    })
  }

  const toggleFlag = () => {
    onUpdateSession((prev) => {
      if (!prev) return prev
      const flagged = prev.flaggedQuestions.includes(prev.currentIndex)
        ? prev.flaggedQuestions.filter((i) => i !== prev.currentIndex)
        : [...prev.flaggedQuestions, prev.currentIndex]
      return { ...prev, flaggedQuestions: flagged }
    })
  }

  const goTo = (index: number) => {
    onUpdateSession((prev) => (prev ? { ...prev, currentIndex: index } : prev))
  }

  const unansweredCount = session.answers.filter((a) => a === null).length

  const timerClass =
    remaining < 60
      ? 'timer-danger font-mono text-2xl font-bold'
      : remaining < 180
        ? 'timer-amber font-mono text-2xl font-bold'
        : 'font-mono text-2xl font-bold text-ink-950 dark:text-paper-50'

  return (
    <div className="exam-mode animate-fade-in mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 lg:flex-row lg:px-6">
      <AntiCameraOverlay email={session.candidateName} active={test.enableAIProctoring !== false} />

      {lockoutUntil && Date.now() < lockoutUntil ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink-950/95 px-4 text-center">
          <div className="max-w-md border border-signal-600 bg-ink-dark-surface p-8">
            <div className="seal mx-auto h-14 w-14 text-signal-100">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="font-serif mt-4 text-xl font-medium text-paper-50">Assessment suspended</h3>
            <p className="mt-2 text-sm text-ink-300">
              Your session was suspended due to a tab switch, device disconnect, or fullscreen exit.
            </p>
            <div className="my-6 border border-ink-700 bg-ink-dark-bg p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-300">Cooldown period</p>
              <p className="mt-1 font-mono text-3xl font-bold text-signal-100">
                {Math.floor(lockoutTimeLeft / 60)}:{(lockoutTimeLeft % 60).toString().padStart(2, '0')}
              </p>
            </div>
            <p className="text-sm font-semibold text-brass-100">
              Suspensions: {lockoutCount} / 2 warnings
            </p>
            <p className="mt-1 text-[11px] text-ink-300">
              A third infraction results in immediate, automatic submission.
            </p>
            <button
              type="button"
              disabled={lockoutTimeLeft > 0}
              onClick={() => {
                setLockoutUntil(null)
                enterFullscreen()
              }}
              className="mt-6 w-full rounded-sm bg-paper-50 py-3 text-sm font-semibold text-ink-950 transition-colors duration-150 hover:bg-paper-200 disabled:opacity-50"
            >
              {lockoutTimeLeft > 0 ? 'Cooldown active' : 'Resume assessment'}
            </button>
          </div>
        </div>
      ) : (
        !isFullscreen && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink-950/90 px-4 text-center">
            <div className="max-w-md border border-brass-600 bg-ink-dark-surface p-8">
              <div className="seal mx-auto h-14 w-14 text-brass-100">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="font-serif mt-4 text-xl font-medium text-paper-50">Fullscreen required</h3>
              <p className="mt-2 text-sm text-ink-300">
                This assessment requires your window to remain in fullscreen mode.
              </p>
              <button
                type="button"
                onClick={enterFullscreen}
                className="mt-6 w-full rounded-sm bg-paper-50 py-3 text-sm font-semibold text-ink-950 transition-colors duration-150 hover:bg-paper-200"
              >
                Enter fullscreen mode
              </button>
            </div>
          </div>
        )
      )}

      {/* Main question area */}
      <div className="flex-1">
        {/* Top bar — always visible */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-paper-200 bg-white px-4 py-3 dark:border-ink-700 dark:bg-ink-dark-surface">
          <div>
            <p className="text-xs text-ink-500 dark:text-ink-300">{test.code}</p>
            <h2 className="font-semibold text-ink-950 dark:text-paper-50">{test.title}</h2>
            <p className="text-sm text-ink-500 dark:text-ink-300">
              Candidate: {session.candidateName}
            </p>
            <p aria-live="polite" className={`text-xs ${saveStatus === 'offline' ? 'text-signal-700 dark:text-signal-100' : 'text-ink-300'}`}>
              {saveStatus === 'saving' ? 'Saving progress…' : saveStatus === 'saved' ? 'Progress saved' : 'Offline — retrying on next change'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-300">
              Time remaining
            </p>
            <p className={timerClass}>{formatTimeRemaining(remaining)}</p>
          </div>
        </div>

        <div className="border border-paper-200 bg-white p-6 dark:border-ink-700 dark:bg-ink-dark-surface sm:p-8">
          <div className="flex items-center justify-between">
            <p className="font-mono text-sm text-brass-700 dark:text-brass-100">
              Question {session.currentIndex + 1} of {test.questions.length}
            </p>
            <button
              type="button"
              onClick={toggleFlag}
              title={isFlagged ? 'Remove flag' : 'Flag for review'}
              className={`flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                isFlagged
                  ? 'border-brass-600 bg-brass-50 text-brass-700 dark:border-brass-600 dark:bg-brass-100/10 dark:text-brass-100'
                  : 'border-paper-200 text-ink-500 hover:border-brass-600 hover:text-brass-700 dark:border-ink-700 dark:text-ink-300'
              }`}
            >
              <Flag className={`h-3.5 w-3.5 ${isFlagged ? 'fill-brass-600' : ''}`} />
              {isFlagged ? 'Flagged' : 'Flag for review'}
            </button>
          </div>

          <h3 className="font-serif mt-4 text-xl font-medium leading-relaxed text-ink-950 dark:text-paper-50 sm:text-2xl whitespace-pre-wrap">
            {currentQ.text}
          </h3>
          {currentQ.marks && currentQ.marks > 1 && (
            <p className="mt-1 text-xs text-brass-600 dark:text-brass-100">
              [{currentQ.marks} marks]
            </p>
          )}

          {currentQ.type === 'coding' ? (
            <div className="mt-8">
              <CodeEditor
                code={typeof selected === 'object' && selected !== null ? selected.code : (currentQ.starterCode?.[currentQ.allowedLanguages?.[0] || 'python'] || '')}
                language={typeof selected === 'object' && selected !== null ? selected.language : (currentQ.allowedLanguages?.[0] || 'python')}
                onChange={(code) => {
                  const lang = typeof selected === 'object' && selected !== null ? selected.language : (currentQ.allowedLanguages?.[0] || 'python')
                  setAnswer({ code: code || '', language: lang })
                }}
                testCases={currentQ.testCases || []}
                testId={test.id}
                questionId={currentQ.id}
              />
            </div>
          ) : (
            <div className="mt-8 space-y-3">
              {(currentQ.options || []).map((opt, i) => {
                const isSelected = selected === i
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAnswer(i)}
                    className={`flex w-full items-start gap-4 border px-4 py-4 text-left transition-colors duration-150 ${
                      isSelected
                        ? 'border-ink-950 bg-paper-100 dark:border-paper-200 dark:bg-ink-dark-bg'
                        : 'border-paper-200 bg-paper-50 hover:border-ink-500 dark:border-ink-700 dark:bg-ink-dark-bg/40 dark:hover:border-ink-500'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center font-mono text-sm font-bold ${
                        isSelected
                          ? 'bg-ink-950 text-paper-50 dark:bg-paper-50 dark:text-ink-950'
                          : 'bg-paper-200 text-ink-700 dark:bg-ink-700 dark:text-paper-200'
                      }`}
                    >
                      {LABELS[i]}
                    </span>
                    <span className="pt-1 text-ink-700 dark:text-paper-200">{opt}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              disabled={session.currentIndex === 0}
              onClick={() => goTo(session.currentIndex - 1)}
              className="flex items-center gap-1 border border-paper-200 px-4 py-2 text-sm font-medium text-ink-700 transition-colors duration-150 hover:bg-paper-100 disabled:opacity-40 dark:border-ink-700 dark:text-paper-200 dark:hover:bg-ink-dark-bg"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            {session.currentIndex < test.questions.length - 1 ? (
              <button
                type="button"
                onClick={() => goTo(session.currentIndex + 1)}
                className="flex items-center gap-1 rounded-sm bg-ink-950 px-4 py-2 text-sm font-medium text-paper-50 transition-colors duration-150 hover:bg-ink-700 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="flex items-center gap-2 rounded-sm bg-verify-700 px-5 py-2 text-sm font-medium text-paper-50 transition-colors duration-150 hover:bg-verify-600"
              >
                <Send className="h-4 w-4" />
                Submit assessment
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="w-full space-y-4 lg:w-72">
        {/* Camera Proctoring */}
        {test.enableAIProctoring !== false && (
          <div className="border border-paper-200 bg-paper-100 p-4 dark:border-ink-700 dark:bg-ink-dark-surface">
            <CameraProctor active onVideoRef={handleVideoRef} onMediaEvent={handleMediaEvent} />
          </div>
        )}

        {/* AI Proctoring Monitor */}
        {test.enableAIProctoring !== false && (
          <div className="border border-paper-200 bg-paper-100 p-4 dark:border-ink-700 dark:bg-ink-dark-surface">
            <AIProctorMonitor
              videoRef={videoRef}
              active={true}
              enableTranscription={test.enableVoiceTranscription === true}
              onProctorEvent={addProctorEvent}
            />
          </div>
        )}

        {/* Session integrity */}
        <div className="border border-paper-200 bg-white p-4 dark:border-ink-700 dark:bg-ink-dark-surface">
          <div className="mb-3 flex items-center gap-2 border-b border-paper-200 pb-3 dark:border-ink-700">
            <Shield className="h-4 w-4 text-brass-600 dark:text-brass-100" />
            <h4 className="text-sm font-semibold text-ink-950 dark:text-paper-50">
              Session integrity
            </h4>
          </div>
          <div
            className={`px-3 py-2 text-sm ${
              session.proctorEvents.length === 0
                ? 'bg-verify-50 text-verify-700 dark:bg-verify-100/10 dark:text-verify-600'
                : 'bg-brass-50 text-brass-700 dark:bg-brass-100/10 dark:text-brass-100'
            }`}
          >
            {session.proctorEvents.length === 0 ? (
              'Pristine — no flags recorded'
            ) : (
              <span className="flex items-center gap-1">
                <Flag className="h-3.5 w-3.5" />
                {session.proctorEvents.length} event(s) flagged
              </span>
            )}
          </div>
          {session.proctorEvents.length > 0 && (
            <div className="mt-3 max-h-32 space-y-1 overflow-y-auto">
              {session.proctorEvents.map((ev, i) => (
                <p
                  key={i}
                  className="flex items-start gap-1 text-xs text-brass-700 dark:text-brass-100"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {ev.message}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Jump map */}
        <div className="border border-paper-200 bg-white p-4 dark:border-ink-700 dark:bg-ink-dark-surface">
          <h4 className="eyebrow mb-3">Jump map</h4>
          <div className="grid grid-cols-5 gap-2">
            {test.questions.map((_, i) => {
              const answered = session.answers[i] !== null
              const isCurrent = session.currentIndex === i
              const flagged = session.flaggedQuestions.includes(i)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => goTo(i)}
                  title={flagged ? 'Flagged for review' : undefined}
                  className={`relative aspect-square font-mono text-sm font-medium transition-colors duration-150 ${
                    isCurrent
                      ? 'bg-ink-950 text-paper-50 dark:bg-paper-50 dark:text-ink-950'
                      : answered
                        ? 'bg-paper-200 text-ink-700 dark:bg-ink-700 dark:text-paper-200'
                        : 'border border-paper-200 text-ink-500 dark:border-ink-700 dark:text-ink-300'
                  }`}
                >
                  {i + 1}
                  {flagged && (
                    <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-brass-600 text-[8px] text-paper-50">
                      &#9679;
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex gap-3 text-xs text-ink-500 dark:text-ink-300">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 bg-paper-200 dark:bg-ink-700" /> Answered
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 border border-paper-200 dark:border-ink-700" /> Skipped
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-brass-600" /> Flagged
            </span>
          </div>
        </div>

        {/* Submit early */}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="flex w-full items-center justify-center gap-2 border border-dashed border-paper-200 py-3 text-sm font-medium text-ink-700 transition-colors duration-150 hover:border-verify-700 hover:text-verify-700 dark:border-ink-700 dark:text-paper-200 dark:hover:border-verify-600 dark:hover:text-verify-600"
        >
          <Send className="h-4 w-4" />
          Submit early
        </button>
      </aside>

      {/* Submit confirmation modal */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm submission"
      >
        <div className="space-y-4">
          {unansweredCount > 0 && (
            <div className="flex gap-3 border border-brass-600 bg-brass-50 p-3 dark:border-brass-600 dark:bg-brass-100/10">
              <AlertTriangle className="h-5 w-5 shrink-0 text-brass-700 dark:text-brass-100" />
              <p className="text-sm text-brass-700 dark:text-brass-100">
                You have <strong>{unansweredCount}</strong> unanswered question{unansweredCount > 1 ? 's' : ''}.
                These will be marked as incorrect.
              </p>
            </div>
          )}
          {session.flaggedQuestions.length > 0 && (
            <div className="flex gap-3 border border-paper-200 bg-paper-100 p-3 dark:border-ink-700 dark:bg-ink-dark-bg">
              <Flag className="h-5 w-5 shrink-0 text-brass-600 dark:text-brass-100" />
              <p className="text-sm text-ink-700 dark:text-paper-200">
                You have <strong>{session.flaggedQuestions.length}</strong> question{session.flaggedQuestions.length > 1 ? 's' : ''} flagged for review.
              </p>
            </div>
          )}
          <p className="text-sm text-ink-700 dark:text-paper-200">
            Once submitted, you <strong>cannot</strong> return to this assessment. Are you sure you want to submit?
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="flex-1 border border-paper-200 py-2.5 text-sm font-medium text-ink-700 transition-colors duration-150 hover:bg-paper-100 dark:border-ink-700 dark:text-paper-200 dark:hover:bg-ink-dark-bg"
            >
              Continue assessment
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(false)
                submitOnce(session)
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-verify-700 py-2.5 text-sm font-medium text-paper-50 transition-colors duration-150 hover:bg-verify-600"
            >
              <Send className="h-4 w-4" />
              Submit now
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
