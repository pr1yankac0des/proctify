import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { Student } from '../types'

const SESSION_KEY = 'academyflow_student_session'

interface StudentContextValue {
  student: Student | null
  setStudent: (student: Student | null) => void
  logout: () => void
}

const StudentContext = createContext<StudentContextValue | null>(null)

function loadSession(): Student | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Student) : null
  } catch {
    return null
  }
}

export function StudentProvider({ children }: { children: ReactNode }) {
  const [student, setStudentState] = useState<Student | null>(loadSession)

  const setStudent = useCallback((s: Student | null) => {
    setStudentState(s)
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  }, [])

  const logout = useCallback(() => setStudent(null), [setStudent])

  useEffect(() => {
    const expireSession = () => setStudentState(null)
    window.addEventListener('academyflow:student-session-expired', expireSession)
    return () => window.removeEventListener('academyflow:student-session-expired', expireSession)
  }, [])

  return (
    <StudentContext.Provider value={{ student, setStudent, logout }}>
      {children}
    </StudentContext.Provider>
  )
}

export function useStudent() {
  const ctx = useContext(StudentContext)
  if (!ctx) throw new Error('useStudent must be used within StudentProvider')
  return ctx
}
