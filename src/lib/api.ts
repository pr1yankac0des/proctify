import type { ExamAttempt, ExamSession, Student, Submission, Test } from '../types'

// In production: VITE_API_URL points to the Render backend (e.g. https://academyflow-api.onrender.com/api)
// In local dev: Vite proxies /api → http://localhost:3001 automatically
const BASE = (import.meta.env.VITE_API_URL as string) || '/api'

// Retrieve admin token from sessionStorage for protected requests
function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem('academyflow_admin_token')
  } catch {
    return null
  }
}

function getStudentToken(): string | null {
  try {
    const session = JSON.parse(localStorage.getItem('academyflow_student_session') || 'null')
    return typeof session?.sessionToken === 'string' ? session.sessionToken : null
  } catch {
    return null
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const studentToken = getStudentToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(studentToken ? { 'x-student-token': studentToken } : {}),
      ...options?.headers,
    },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && studentToken && (path.startsWith('/submissions') || path.startsWith('/live'))) {
    localStorage.removeItem('academyflow_student_session')
    window.dispatchEvent(new Event('academyflow:student-session-expired'))
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data as T
}

async function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAdminToken()
  return request<T>(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-admin-token': token } : {}),
      ...options?.headers,
    },
  })
}

export const api = {
  // ── Admin auth ────────────────────────────────────────────────────────────
  adminLogin: (password: string) =>
    request<{ token: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  adminLogout: () =>
    adminRequest<{ ok: boolean }>('/admin/logout', { method: 'POST' }),

  // ── Tests ─────────────────────────────────────────────────────────────────
  getTests: () => adminRequest<Test[]>('/tests'),
  getTest: (id: string) => request<Test>(`/tests/${id}`), // public
  saveTest: (test: Test) =>
    adminRequest<Test>('/tests', { method: 'POST', body: JSON.stringify(test) }),
  deleteTest: (id: string) =>
    adminRequest<{ ok: boolean }>(`/tests/${id}`, { method: 'DELETE' }),

  // ── Exam attempts ─────────────────────────────────────────────────────────
  getAttempt: (testId: string) => request<ExamAttempt | null>(`/attempts/${testId}`),
  startAttempt: (testId: string) => request<ExamAttempt>('/attempts/start', {
    method: 'POST',
    body: JSON.stringify({ testId, monitoringConsent: true }),
  }),
  saveAttempt: (session: ExamSession) => request<ExamAttempt>(`/attempts/${session.attemptId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      answers: session.answers,
      flaggedQuestions: session.flaggedQuestions,
      currentIndex: session.currentIndex,
      proctorEvents: session.proctorEvents,
    }),
  }),

  // ── Submissions ───────────────────────────────────────────────────────────
  // Admin: get all submissions
  getSubmissions: (params?: { testId?: string; studentId?: string }) => {
    const q = new URLSearchParams()
    if (params?.testId) q.set('testId', params.testId)
    if (params?.studentId) q.set('studentId', params.studentId)
    const qs = q.toString()
    return adminRequest<Submission[]>(`/submissions${qs ? `?${qs}` : ''}`)
  },
  // Student: get own submissions (no admin token)
  getStudentSubmissions: (params: { testId?: string; studentId: string }) => {
    const q = new URLSearchParams()
    q.set('studentId', params.studentId)
    if (params.testId) q.set('testId', params.testId)
    return request<Submission[]>(`/submissions/student?${q.toString()}`)
  },
  saveSubmission: (submission: Omit<Submission, 'id'> & { attemptId: string; id?: string }) =>
    request<Submission>('/submissions', {
      method: 'POST',
      body: JSON.stringify(submission),
    }),
  deleteSubmission: (id: string) =>
    adminRequest<{ ok: boolean }>(`/submissions/${id}`, { method: 'DELETE' }),

  // ── Students ──────────────────────────────────────────────────────────────
  getStudents: () => adminRequest<Student[]>('/students'),
  setStudentExtraTime: (id: string, extraTimeMinutes: number) =>
    adminRequest<Student>(`/students/${id}/accommodations`, {
      method: 'PATCH',
      body: JSON.stringify({ extraTimeMinutes }),
    }),
  deleteStudent: (id: string) =>
    adminRequest<{ ok: boolean }>(`/students/${id}`, { method: 'DELETE' }),

  // ── Auth ──────────────────────────────────────────────────────────────────
  signup: (body: { fullName: string; registrationNumber: string; email: string }) =>
    request<{
      message: string
      studentId: string
      requiresVerification: boolean
      devCode?: string
    }>('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),

  verify: (body: { email: string; code: string }) =>
    request<{ student: Student }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { registrationNumber: string; email: string }) =>
    request<{
      student?: Student
      requiresVerification?: boolean
      message?: string
      devCode?: string
    }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  resendCode: (body: { registrationNumber: string; email: string }) =>
    request<{ message: string; devCode?: string }>('/auth/resend', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  executeCode: (language: string, code: string, stdin: string, testId?: string, questionId?: string) =>
    request<{
      run?: { stdout: string; output: string }
      publicResults?: { passed: boolean; output: string }[]
      hiddenStats?: { passed: number; total: number; allPassed: boolean }
      earnedMarks?: number
      maxMarks?: number
      message?: string
      error?: string
    }>('/execute', {
      method: 'POST',
      body: JSON.stringify({ language, code, stdin, testId, questionId }),
    }),
}
