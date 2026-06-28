import {
  Check,
  ClipboardList,
  Copy,
  Download,
  Edit3,
  Eye,
  FileText,
  Filter,
  LogOut,
  Plus,
  Trash2,
  Users,
  UserX,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '../components/Modal'
import { QuestionReview } from '../components/QuestionReview'
import { useAdmin } from '../context/AdminContext'
import { api } from '../lib/api'
import { formatDuration } from '../lib/scoring'
import { formatScheduleRange } from '../lib/schedule'
import { copyToClipboard, getTestShareUrl } from '../lib/storage'
import type { Student, Submission, Test } from '../types'

interface AdminDashboardProps {
  tests: Test[]
  submissions: Submission[]
  onCreateTest: () => void
  onEditTest: (testId: string) => void
  onDeleteTest: (testId: string) => void
  onDuplicateTest: (test: Test) => void
  onViewSubmission: (submissionId: string) => void
  onRefresh: () => void
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportSubmissionsCSV(submissions: Submission[], tests: Test[]) {
  const testMap = new Map(tests.map((t) => [t.id, t]))
  const headers = [
    'Candidate Name',
    'Registration Number',
    'Email',
    'Test Title',
    'Test Code',
    'Score',
    'Total Marks',
    'Percentage',
    'Duration',
    'Submitted At',
    'Integrity Flags',
    'Result',
  ]

  const rows = submissions.map((sub) => {
    const test = testMap.get(sub.testId)
    const total = sub.totalMarks ?? sub.totalQuestions
    const pct = total > 0 ? Math.round((sub.score / total) * 100) : 0
    const passMark = test?.passMark ?? 50
    return [
      `"${sub.candidateName}"`,
      `"${sub.registrationNumber}"`,
      `"${sub.email}"`,
      `"${sub.testTitle}"`,
      `"${test?.code ?? ''}"`,
      sub.score,
      total,
      `${pct}%`,
      formatDuration(sub.durationSeconds),
      `"${new Date(sub.submittedAt).toLocaleString()}"`,
      sub.proctorEvents.length,
      pct >= passMark ? 'PASS' : 'FAIL',
    ].join(',')
  })

  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `submissions_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Component ────────────────────────────────────────────────────────────────
export function AdminDashboard({
  tests,
  submissions,
  onCreateTest,
  onEditTest,
  onDeleteTest,
  onDuplicateTest,
  onViewSubmission,
  onRefresh,
}: AdminDashboardProps) {
  const { logout } = useAdmin()
  const [tab, setTab] = useState<'tests' | 'submissions' | 'students'>('tests')
  const [filterTestId, setFilterTestId] = useState<string>('all')
  const [inspectorSub, setInspectorSub] = useState<Submission | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null)

  // Students tab state
  const [students, setStudents] = useState<Student[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)

  const stats = useMemo(() => {
    const totalTests = tests.length
    const totalSubs = submissions.length
    let totalScore = 0
    let totalMarks = 0
    let passedCount = 0
    let flaggedCount = 0

    submissions.forEach((sub) => {
      totalScore += sub.score
      const totalQMarks = sub.totalMarks ?? sub.totalQuestions
      totalMarks += totalQMarks
      const test = tests.find((t) => t.id === sub.testId)
      const pct = totalQMarks > 0 ? (sub.score / totalQMarks) * 100 : 0
      if (pct >= (test?.passMark ?? 50)) {
        passedCount++
      }
      if (sub.proctorEvents.length > 0) {
        flaggedCount++
      }
    })

    const avgPct = totalMarks > 0 ? Math.round((totalScore / totalMarks) * 100) : 0
    const passRate = totalSubs > 0 ? Math.round((passedCount / totalSubs) * 100) : 0
    const cleanRate = totalSubs > 0 ? Math.round(((totalSubs - flaggedCount) / totalSubs) * 100) : 100

    return { totalTests, totalSubs, avgPct, passRate, cleanRate }
  }, [tests, submissions])

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true)
    try {
      const data = await api.getStudents()
      setStudents(data)
    } catch {
      // silently fail
    } finally {
      setStudentsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'students') loadStudents()
  }, [tab, loadStudents])

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm('Delete this student and all their submissions?')) return
    await api.deleteStudent(studentId)
    await loadStudents()
    onRefresh()
  }

  const handleExtraTime = async (student: Student, minutes: number) => {
    const updated = await api.setStudentExtraTime(student.id, Math.max(0, Math.min(240, minutes)))
    setStudents((current) => current.map((item) => item.id === updated.id ? updated : item))
  }

  const handleDeleteSubmission = async (submissionId: string) => {
    if (!confirm('Delete this submission? The student will be able to retake the test.')) return
    await api.deleteSubmission(submissionId)
    onRefresh()
  }

  const handleLogout = async () => {
    await api.adminLogout()
    logout()
  }

  const copyLink = async (testId: string) => {
    const url = getTestShareUrl(testId)
    await copyToClipboard(url)
    setCopiedId(testId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filteredSubmissions = useMemo(() => {
    if (filterTestId === 'all') return submissions
    return submissions.filter((s) => s.testId === filterTestId)
  }, [submissions, filterTestId])

  const getTestSubmissions = (testId: string) =>
    submissions.filter((s) => s.testId === testId)

  const inspectorTest = inspectorSub
    ? tests.find((t) => t.id === inspectorSub.testId)
    : null

  const tabs = [
    { id: 'tests' as const, label: 'My Published Tests', icon: FileText },
    { id: 'submissions' as const, label: 'Candidate Submissions', icon: Users },
    { id: 'students' as const, label: 'Students', icon: UserX },
  ]

  return (
    <div className="animate-fade-in mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-medium text-ink-950 dark:text-paper-50">Creator Studio</h2>
          <p className="text-sm text-ink-700 dark:text-paper-200">
            Create tests, share links with students, and review scores
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCreateTest}
            className="flex items-center gap-2 rounded-sm bg-ink-950 px-5 py-2.5 text-sm font-medium text-paper-50 transition-colors duration-150 hover:bg-ink-700 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200"
          >
            <Plus className="h-4 w-4" />
            New Assessment
          </button>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out of admin"
            className="flex items-center gap-2 border border-paper-200 px-4 py-2.5 text-sm font-medium text-ink-700 transition-colors duration-200 hover:bg-paper-100 dark:border-ink-700 dark:text-paper-200 dark:hover:bg-ink-dark-bg"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Visual Analytics */}
      {submissions.length > 0 && (
        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: Pass Rate Ring */}
          <div className="border border-paper-200 bg-white p-5 dark:border-ink-700 dark:bg-ink-dark-surface flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-500 dark:text-ink-300">Pass Rate</p>
              <h3 className="mt-1 text-3xl font-bold text-ink-950 dark:text-paper-50">{stats.passRate}%</h3>
              <p className="mt-1 text-xs text-ink-300">Passing threshold met</p>
            </div>
            <div className="relative h-16 w-16">
              <svg className="h-full w-full" viewBox="0 0 36 36">
                <path
                  className="text-paper-200 dark:text-ink-700"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-verify-700 dark:text-verify-600"
                  strokeWidth="3.5"
                  strokeDasharray={`${stats.passRate}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
            </div>
          </div>

          {/* Card 2: Average Score Bar */}
          <div className="border border-paper-200 bg-white p-5 dark:border-ink-700 dark:bg-ink-dark-surface flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-500 dark:text-ink-300">Average Score</p>
              <h3 className="mt-1 text-3xl font-bold text-brass-700 dark:text-brass-100">{stats.avgPct}%</h3>
              <p className="mt-1 text-xs text-ink-300">Overall cohort mean</p>
            </div>
            <div className="relative h-16 w-16">
              <svg className="h-full w-full" viewBox="0 0 36 36">
                <path
                  className="text-paper-200 dark:text-ink-700"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-brass-600"
                  strokeWidth="3.5"
                  strokeDasharray={`${stats.avgPct}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
            </div>
          </div>

          {/* Card 3: Integrity Index */}
          <div className="border border-paper-200 bg-white p-5 dark:border-ink-700 dark:bg-ink-dark-surface flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-500 dark:text-ink-300">Integrity Index</p>
              <h3 className="mt-1 text-3xl font-bold text-brass-600 dark:text-brass-100">{stats.cleanRate}%</h3>
              <p className="mt-1 text-xs text-ink-300">No flags recorded</p>
            </div>
            <div className="relative h-16 w-16">
              <svg className="h-full w-full" viewBox="0 0 36 36">
                <path
                  className="text-paper-200 dark:text-ink-700"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-brass-600 dark:text-brass-100"
                  strokeWidth="3.5"
                  strokeDasharray={`${stats.cleanRate}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border border-paper-200 bg-paper-100 p-1 dark:border-ink-700 dark:bg-ink-dark-surface">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${
              tab === id
                ? 'bg-white text-ink-950 dark:bg-ink-dark-surface dark:text-paper-50'
                : 'text-ink-700 dark:text-paper-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tests Tab ── */}
      {tab === 'tests' && (
        <div className="space-y-4">
          {tests.length === 0 ? (
            <div className="border border-dashed border-paper-200 p-12 text-center dark:border-ink-700">
              <p className="text-ink-500 dark:text-ink-300">No tests published yet.</p>
              <button
                type="button"
                onClick={onCreateTest}
                className="mt-4 text-brass-700 hover:underline dark:text-brass-100"
              >
                Create your first assessment
              </button>
            </div>
          ) : (
            tests.map((test) => {
              const testSubs = getTestSubmissions(test.id)
              const isExpanded = expandedTestId === test.id
              return (
                <div
                  key={test.id}
                  className="border border-paper-200 bg-white p-5 transition-colors duration-200 hover:border-ink-500 dark:border-ink-700 dark:bg-ink-dark-surface dark:hover:border-ink-500"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="font-mono text-xs text-brass-700 dark:text-brass-100">
                        {test.code}
                      </span>
                      <h3 className="text-lg font-semibold text-ink-950 dark:text-paper-50">
                        {test.title}
                      </h3>
                      <p className="mt-1 text-sm text-ink-700 dark:text-paper-200">
                        {test.description}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-4 font-mono text-xs text-ink-500 dark:text-ink-300">
                        <span>{test.questions.length} questions</span>
                        <span>{test.timeLimitMinutes} min limit</span>
                        <span>{testSubs.length} submission(s)</span>
                        {test.passMark !== undefined && (
                          <span>Pass ≥ {test.passMark}%</span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-ink-500 dark:text-ink-300">
                        Window: {formatScheduleRange(test)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copyLink(test.id)}
                        className="flex items-center gap-1 border border-brass-600 bg-brass-50 px-3 py-2 text-sm text-brass-700 transition-colors duration-150 hover:bg-brass-100 dark:border-brass-600 dark:bg-brass-100/10 dark:text-brass-100"
                      >
                        {copiedId === test.id ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        {copiedId === test.id ? 'Copied!' : 'Copy Link'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditTest(test.id)}
                        className="flex items-center gap-1 border border-paper-200 px-3 py-2 text-sm text-ink-700 transition-colors duration-200 hover:bg-paper-100 dark:border-ink-700 dark:text-paper-200 dark:hover:bg-ink-dark-bg"
                      >
                        <Edit3 className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateTest(test)}
                        title="Duplicate test"
                        className="flex items-center gap-1 border border-paper-200 px-3 py-2 text-sm text-ink-700 transition-colors duration-200 hover:bg-paper-100 dark:border-ink-700 dark:text-paper-200 dark:hover:bg-ink-dark-bg"
                      >
                        <FileText className="h-4 w-4" />
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTest(test.id)}
                        className="flex items-center gap-1 border border-signal-600 px-3 py-2 text-sm text-signal-700 transition-colors duration-150 hover:bg-signal-50 dark:border-signal-600 dark:text-signal-100 dark:hover:bg-signal-100/10"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {testSubs.length > 0 && (
                    <div className="mt-4 border-t border-paper-200 pt-4 dark:border-ink-700">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-300">
                          Recent Submissions
                        </p>
                        {testSubs.length > 3 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTestId(isExpanded ? null : test.id)
                            }
                            className="text-xs text-brass-700 hover:underline dark:text-brass-100"
                          >
                            {isExpanded
                              ? 'Show less'
                              : `View all ${testSubs.length}`}
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {(isExpanded ? testSubs : testSubs.slice(0, 3)).map((sub) => (
                          <div
                            key={sub.id}
                            className="flex flex-wrap items-center justify-between gap-2 border border-paper-200 bg-paper-50 px-3 py-2 dark:border-ink-700 dark:bg-ink-dark-surface"
                          >
                            <span className="text-sm font-medium text-ink-950 dark:text-paper-50">
                              {sub.candidateName}
                              <span className="ml-2 font-mono text-xs text-ink-300">
                                {sub.registrationNumber}
                              </span>
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs text-ink-500">
                                {sub.score}/{sub.totalMarks ?? sub.totalQuestions}
                              </span>
                              <button
                                type="button"
                                onClick={() => setInspectorSub(sub)}
                                className="text-xs text-brass-700 hover:underline dark:text-brass-100"
                              >
                                Inspect
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSubmission(sub.id)}
                                title="Delete submission (allows retake)"
                                className="text-xs text-signal-600 hover:text-signal-700 dark:text-signal-100"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Submissions Tab ── */}
      {tab === 'submissions' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Filter className="h-4 w-4 text-ink-500" />
              <select
                value={filterTestId}
                onChange={(e) => setFilterTestId(e.target.value)}
                className="border border-paper-200 bg-white px-3 py-2 text-sm text-ink-700 outline-none focus:ring-2 focus:ring-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-200"
              >
                <option value="all">All Tests</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
            {filteredSubmissions.length > 0 && (
              <button
                type="button"
                onClick={() => exportSubmissionsCSV(filteredSubmissions, tests)}
                className="flex items-center gap-2 border border-verify-700 bg-verify-50 px-4 py-2 text-sm font-medium text-verify-700 transition-colors duration-150 hover:bg-verify-100 dark:border-verify-600 dark:bg-verify-100/10 dark:text-verify-600"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-paper-200 bg-white dark:border-ink-700 dark:bg-ink-dark-surface">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-paper-200 bg-paper-100 dark:border-ink-700 dark:bg-ink-dark-surface">
                  {['Candidate', 'Reg. No.', 'Test', 'Score', 'Duration', 'Security', 'Result', 'Actions'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 font-medium text-ink-700 dark:text-paper-200"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-ink-500 dark:text-ink-300"
                    >
                      No submissions found.
                    </td>
                  </tr>
                ) : (
                  filteredSubmissions.map((sub) => {
                    const test = tests.find((t) => t.id === sub.testId)
                    const total = sub.totalMarks ?? sub.totalQuestions
                    const pct = total > 0 ? Math.round((sub.score / total) * 100) : 0
                    const passed = pct >= (test?.passMark ?? 50)
                    return (
                      <tr
                        key={sub.id}
                        className="border-b border-paper-200 transition-colors duration-150 hover:bg-paper-100 dark:border-ink-700 dark:hover:bg-ink-dark-bg"
                      >
                        <td className="px-4 py-3 font-medium text-ink-950 dark:text-paper-50">
                          {sub.candidateName}
                        </td>
                        <td className="px-4 py-3 font-mono text-ink-700 dark:text-paper-200">
                          {sub.registrationNumber}
                        </td>
                        <td className="px-4 py-3 text-ink-700 dark:text-paper-200">
                          {sub.testTitle}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {sub.score}/{total} ({pct}%)
                        </td>
                        <td className="px-4 py-3 font-mono text-ink-700 dark:text-paper-200">
                          {formatDuration(sub.durationSeconds)}
                        </td>
                        <td className="px-4 py-3">
                          {sub.proctorEvents.length === 0 ? (
                            <span className="text-verify-700 dark:text-verify-600">Pristine</span>
                          ) : (
                            <span className="text-brass-700 dark:text-brass-100">
                              {sub.proctorEvents.length} flags
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              passed
                                ? 'bg-verify-100 text-verify-700 dark:bg-verify-100/10 dark:text-verify-600'
                                : 'bg-signal-100 text-signal-700 dark:bg-signal-100/10 dark:text-signal-100'
                            }`}
                          >
                            {passed ? 'PASS' : 'FAIL'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setInspectorSub(sub)}
                              className="flex items-center gap-1 text-brass-700 hover:underline dark:text-brass-100"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Inspect
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSubmission(sub.id)}
                              title="Delete (allow retake)"
                              className="text-signal-600 hover:text-signal-700 dark:text-signal-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Students Tab ── */}
      {tab === 'students' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-ink-700 dark:text-paper-200">
              {students.length} registered student{students.length !== 1 ? 's' : ''}
            </p>
            <button
              type="button"
              onClick={loadStudents}
              className="text-sm text-brass-700 hover:underline dark:text-brass-100"
            >
              Refresh
            </button>
          </div>
          {studentsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse bg-paper-200 dark:bg-ink-700" />
              ))}
            </div>
          ) : students.length === 0 ? (
            <div className="border border-dashed border-paper-200 p-12 text-center dark:border-ink-700">
              <p className="text-ink-500 dark:text-ink-300">No students registered yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-paper-200 bg-white dark:border-ink-700 dark:bg-ink-dark-surface">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-paper-200 bg-paper-100 dark:border-ink-700 dark:bg-ink-dark-surface">
                    {['Name', 'Reg. No.', 'Email', 'Status', 'Registered', 'Extra Time', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 font-medium text-ink-700 dark:text-paper-200">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const subCount = submissions.filter((s) => s.studentId === student.id).length
                    return (
                      <tr
                        key={student.id}
                        className="border-b border-paper-200 transition-colors duration-150 hover:bg-paper-100 dark:border-ink-700 dark:hover:bg-ink-dark-bg"
                      >
                        <td className="px-4 py-3 font-medium text-ink-950 dark:text-paper-50">
                          {student.fullName}
                        </td>
                        <td className="px-4 py-3 font-mono text-ink-700 dark:text-paper-200">
                          {student.registrationNumber}
                        </td>
                        <td className="px-4 py-3 text-ink-700 dark:text-paper-200">
                          {student.email}
                        </td>
                        <td className="px-4 py-3">
                          {student.verified ? (
                            <span className="bg-verify-100 px-2 py-0.5 text-xs font-medium text-verify-700 dark:bg-verify-100/10 dark:text-verify-600">
                              Verified
                            </span>
                          ) : (
                            <span className="bg-brass-100 px-2 py-0.5 text-xs font-medium text-brass-700 dark:bg-brass-100/10 dark:text-brass-100">
                              Unverified
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">
                          {student.createdAt
                            ? new Date(student.createdAt).toLocaleDateString()
                            : '—'}
                          <span className="ml-2 font-mono">({subCount} sub{subCount !== 1 ? 's' : ''})</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="font-mono text-xs text-ink-700 dark:text-paper-200">
                              +{student.extraTimeMinutes ?? 0} min
                            </span>
                            <button
                              type="button"
                              onClick={() => handleExtraTime(student, (student.extraTimeMinutes ?? 0) + 15)}
                              className="border border-brass-600 px-2 py-1 text-xs text-brass-700 hover:bg-brass-50 dark:border-brass-600 dark:text-brass-100"
                              aria-label={`Add 15 minutes for ${student.fullName}`}
                            >
                              +15
                            </button>
                            {(student.extraTimeMinutes ?? 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => handleExtraTime(student, 0)}
                                className="text-xs text-ink-500 hover:underline"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleDeleteStudent(student.id)}
                            className="flex items-center gap-1 text-sm text-signal-700 hover:underline dark:text-signal-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Inspector Modal */}
      <Modal
        open={!!inspectorSub}
        onClose={() => setInspectorSub(null)}
        title="Candidate Sheet Inspector"
        wide
      >
        {inspectorSub && inspectorTest && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-ink-500 dark:text-ink-300">Candidate</p>
                <p className="font-semibold text-ink-950 dark:text-paper-50">
                  {inspectorSub.candidateName}
                </p>
                <p className="font-mono text-xs text-ink-500">{inspectorSub.registrationNumber}</p>
                <p className="text-xs text-ink-500">{inspectorSub.email}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500 dark:text-ink-300">Score</p>
                <p className="font-mono font-semibold text-ink-950 dark:text-paper-50">
                  {inspectorSub.score}/{inspectorSub.totalMarks ?? inspectorSub.totalQuestions}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-500 dark:text-ink-300">Duration</p>
                <p className="font-mono text-ink-950 dark:text-paper-50">
                  {formatDuration(inspectorSub.durationSeconds)}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-500 dark:text-ink-300">Submitted</p>
                <p className="text-sm text-ink-950 dark:text-paper-50">
                  {new Date(inspectorSub.submittedAt).toLocaleString()}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-950 dark:text-paper-50">
                <ClipboardList className="h-4 w-4" />
                Proctor Audit Trail
              </p>
              {inspectorSub.proctorEvents.length === 0 ? (
                <p className="border border-verify-700 bg-verify-50 px-3 py-2 text-sm text-verify-700 dark:border-verify-600 dark:bg-verify-100/10 dark:text-verify-600">
                  No integrity violations recorded.
                </p>
              ) : (
                <div className="space-y-1 border border-brass-600 bg-brass-50 p-3 dark:border-brass-600 dark:bg-brass-100/10">
                  {inspectorSub.proctorEvents.map((ev, i) => (
                    <p key={i} className="font-mono text-xs text-brass-700 dark:text-brass-100">
                      {ev.message}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-ink-950 dark:text-paper-50">
                Response Sheet
              </p>
              <QuestionReview
                questions={inspectorTest.questions}
                answers={inspectorSub.answers}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                onViewSubmission(inspectorSub.id)
                setInspectorSub(null)
              }}
              className="w-full rounded-sm bg-ink-950 py-2.5 text-sm font-medium text-paper-50 transition-colors duration-150 hover:bg-ink-700 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200"
            >
              Open Full Results View
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
