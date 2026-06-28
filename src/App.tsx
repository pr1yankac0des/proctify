import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from './components/AppHeader'
import { AdminProvider, useAdmin } from './context/AdminContext'
import { StudentProvider, useStudent } from './context/StudentContext'
import { api } from './lib/api'
import { loadDarkMode, saveDarkMode } from './lib/storage'
import { calculateScore, getTotalMarks } from './lib/scoring'
import { generateId } from './lib/storage'
import type { ExamAttempt, ExamSession, Submission, Test } from './types'
import { AdminDashboard } from './views/AdminDashboard'
import { AdminLoginView } from './views/AdminLoginView'
import { ExamView } from './views/ExamView'
import { HomeView } from './views/HomeView'
import { MCQBuilder } from './views/MCQBuilder'
import { ResultsView } from './views/ResultsView'
import { StudentTestView } from './views/StudentTestView'

// ─── Dark mode hook with cross-tab sync ──────────────────────────────────────

function useDarkMode() {
  const [darkMode, setDarkMode] = useState(() => loadDarkMode())

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    saveDarkMode(darkMode)
  }, [darkMode])

  // Sync dark mode across tabs via storage events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'academyflow_dark_mode' && e.newValue !== null) {
        const newVal = e.newValue === 'true'
        setDarkMode(newVal)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return { darkMode, toggleDark: () => setDarkMode((d) => !d) }
}

// ─── Admin App ────────────────────────────────────────────────────────────────

function AdminApp() {
  const { darkMode, toggleDark } = useDarkMode()
  const { isAdmin } = useAdmin()
  const [tests, setTests] = useState<Test[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'admin' | 'builder' | 'results'>('admin')
  const [editingTestId, setEditingTestId] = useState<string | null>(null)
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null)

  // ALL hooks must be called unconditionally before any early return
  const refresh = useCallback(async () => {
    const [t, s] = await Promise.all([api.getTests(), api.getSubmissions()])
    setTests(t)
    setSubmissions(s)
  }, [])

  useEffect(() => {
    if (!isAdmin) return   // skip data fetch if not authenticated
    refresh().finally(() => setLoading(false))
  }, [refresh, isAdmin])

  // Render login screen if not authenticated
  if (!isAdmin) {
    return <AdminLoginView />
  }

  const handleSaveTest = async (test: Test) => {
    await api.saveTest(test)
    await refresh()
    setEditingTestId(null)
    setView('admin')
  }

  const handleDeleteTest = async (testId: string) => {
    if (!confirm('Delete this test? All its submissions will remain but become orphaned.')) return
    await api.deleteTest(testId)
    await refresh()
  }

  const handleDuplicateTest = async (test: Test) => {
    const duplicate: Test = {
      ...test,
      id: generateId('test'),
      code: `${test.code}-COPY`,
      title: `${test.title} (Copy)`,
    }
    await api.saveTest(duplicate)
    await refresh()
  }

  const handleViewSubmission = (submissionId: string) => {
    const sub = submissions.find((s) => s.id === submissionId)
    if (sub) {
      setActiveSubmission(sub)
      setView('results')
    }
  }

  const editingTest = editingTestId ? tests.find((t) => t.id === editingTestId) : undefined
  const resultsTest = activeSubmission
    ? tests.find((t) => t.id === activeSubmission.testId)
    : null

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-paper-200 border-t-ink-950 dark:border-ink-700 dark:border-t-paper-50" />
          <p className="text-sm text-ink-500 dark:text-ink-300">Loading Creator Studio…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <AppHeader
        darkMode={darkMode}
        onToggleDark={toggleDark}
        label={view === 'builder' ? 'MCQ Builder' : view === 'results' ? 'Results' : 'Creator Studio'}
      />
      <main>
        {view === 'admin' && (
          <AdminDashboard
            tests={tests}
            submissions={submissions}
            onCreateTest={() => {
              setEditingTestId(null)
              setView('builder')
            }}
            onEditTest={(id) => {
              setEditingTestId(id)
              setView('builder')
            }}
            onDeleteTest={handleDeleteTest}
            onDuplicateTest={handleDuplicateTest}
            onViewSubmission={handleViewSubmission}
            onRefresh={refresh}
          />
        )}
        {view === 'builder' && (
          <MCQBuilder
            editingTest={editingTest}
            onSave={handleSaveTest}
            onCancel={() => {
              setEditingTestId(null)
              setView('admin')
            }}
          />
        )}
        {view === 'results' && activeSubmission && resultsTest && (
          <ResultsView
            submission={activeSubmission}
            test={resultsTest}
            isAdmin
            onDone={() => {
              setActiveSubmission(null)
              setView('admin')
            }}
          />
        )}
      </main>
    </div>
  )
}

// ─── Student App ──────────────────────────────────────────────────────────────

function StudentApp() {
  const { darkMode, toggleDark } = useDarkMode()
  const { testId } = useParams<{ testId: string }>()
  const navigate = useNavigate()
  const { student } = useStudent()
  const [phase, setPhase] = useState<'gate' | 'exam' | 'results'>('gate')
  const [examSession, setExamSession] = useState<ExamSession | null>(null)
  const [activeTest, setActiveTest] = useState<Test | null>(null)
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null)

  const handleStartTest = (test: Test, attempt: ExamAttempt) => {
    if (!student) return
    setActiveTest(test)
    setExamSession({
      attemptId: attempt.id,
      testId: test.id,
      studentId: student.id,
      candidateName: student.fullName,
      registrationNumber: student.registrationNumber,
      email: student.email,
      answers: attempt.answers,
      flaggedQuestions: attempt.flaggedQuestions,
      currentIndex: attempt.currentIndex,
      startedAt: new Date(attempt.startedAt).getTime(),
      expiresAt: new Date(attempt.expiresAt).getTime(),
      proctorEvents: attempt.proctorEvents,
    })
    setPhase('exam')
  }

  const handleSubmitExam = useCallback(
    async (session: ExamSession) => {
      if (!activeTest) return
      const durationSeconds = Math.floor((Date.now() - session.startedAt) / 1000)
      const score = calculateScore(activeTest.questions, session.answers)
      const totalMarks = getTotalMarks(activeTest.questions)

      try {
        const submission = await api.saveSubmission({
          attemptId: session.attemptId,
          testId: activeTest.id,
          testTitle: activeTest.title,
          studentId: session.studentId,
          candidateName: session.candidateName,
          registrationNumber: session.registrationNumber,
          email: session.email,
          answers: session.answers,
          score,
          totalQuestions: activeTest.questions.length,
          totalMarks,
          durationSeconds,
          submittedAt: new Date().toISOString(),
          proctorEvents: session.proctorEvents,
          active: true,
        })
        setActiveSubmission(submission)
        setExamSession(null)
        setPhase('results')
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Submission failed.')
        navigate(`/test/${testId}`)
        setPhase('gate')
        setExamSession(null)
      }
    },
    [activeTest, navigate, testId]
  )

  const handleViewResults = (submission: Submission, test: Test) => {
    setActiveSubmission(submission)
    setActiveTest(test)
    setPhase('results')
  }

  if (!testId) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen">
      <AppHeader
        darkMode={darkMode}
        onToggleDark={toggleDark}
        label={phase === 'exam' ? 'Assessment' : phase === 'results' ? 'Results' : 'Test Portal'}
        examActive={phase === 'exam'}
      />
      <main>
        {phase === 'gate' && (
          <StudentTestView
            testId={testId}
            onStartTest={handleStartTest}
            onViewResults={handleViewResults}
          />
        )}
        {phase === 'exam' && activeTest && examSession && (
          <ExamView
            test={activeTest}
            session={examSession}
            onUpdateSession={setExamSession}
            onSubmit={handleSubmitExam}
          />
        )}
        {phase === 'results' && activeSubmission && activeTest && (
          <ResultsView
            submission={activeSubmission}
            test={activeTest}
            onDone={() => {
              setActiveSubmission(null)
              setActiveTest(null)
              setPhase('gate')
              navigate(`/test/${testId}`)
            }}
          />
        )}
      </main>
    </div>
  )
}

// ─── Home App ─────────────────────────────────────────────────────────────────

function HomeApp() {
  const { darkMode, toggleDark } = useDarkMode()
  return (
    <div className="min-h-screen">
      <AppHeader darkMode={darkMode} onToggleDark={toggleDark} label="Student Portal" />
      <main>
        <HomeView />
      </main>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AdminProvider>
        <StudentProvider>
          <Routes>
            <Route path="/" element={<HomeApp />} />
            <Route path="/admin" element={<AdminApp />} />
            <Route path="/test/:testId" element={<StudentApp />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </StudentProvider>
      </AdminProvider>
    </BrowserRouter>
  )
}
