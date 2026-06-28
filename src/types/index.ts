export type QuestionType = 'mcq' | 'coding'

export interface TestCase {
  input: string
  expectedOutput: string
  isHidden: boolean
}

export interface Question {
  id: string
  type?: QuestionType // Optional for backwards compatibility, defaults to 'mcq'
  text: string
  marks?: number
  // MCQ
  options?: [string, string, string, string]
  correctIndex?: number
  // Coding
  allowedLanguages?: string[]
  starterCode?: Record<string, string>
  testCases?: TestCase[]
}

export interface Test {
  id: string
  code: string
  title: string
  description: string
  timeLimitMinutes: number
  scheduledStart: string
  scheduledEnd: string
  questions: Question[]
  passMark?: number
  allowMultipleAttempts?: boolean
  enableAIProctoring?: boolean
  enableVoiceTranscription?: boolean
}

export interface ProctorEvent {
  timestamp: string
  message: string
}

export interface Student {
  id: string
  fullName: string
  registrationNumber: string
  email: string
  verified: boolean
  createdAt?: string
  sessionToken?: string
  extraTimeMinutes?: number
}

export type Answer = number | { code: string; language: string } | null

export interface Submission {
  id: string
  testId: string
  testTitle: string
  studentId: string
  candidateName: string
  registrationNumber: string
  email: string
  answers: Answer[]
  correctAnswers?: (number | null)[] 
  score: number
  totalQuestions: number
  totalMarks?: number
  durationSeconds: number
  submittedAt: string
  proctorEvents: ProctorEvent[]
  active: boolean
}

export interface ExamAttempt {
  id: string
  testId: string
  studentId: string
  startedAt: string
  expiresAt: string
  answers: Answer[]
  flaggedQuestions: number[]
  currentIndex: number
  proctorEvents: ProctorEvent[]
  lastSavedAt: string
  monitoringConsentedAt: string
  status: 'active' | 'submitted'
}

export type AppView = 'student' | 'exam' | 'results' | 'admin' | 'builder'

export interface ExamSession {
  attemptId: string
  testId: string
  studentId: string
  candidateName: string
  registrationNumber: string
  email: string
  answers: Answer[]
  flaggedQuestions: number[]
  currentIndex: number
  startedAt: number
  expiresAt: number
  proctorEvents: ProctorEvent[]
}

export interface BuilderQuestion {
  id: string
  type: QuestionType
  text: string
  marks: number
  // MCQ
  options?: [string, string, string, string]
  correctIndex?: number | null
  // Coding
  allowedLanguages?: string[]
  starterCode?: Record<string, string>
  testCases?: TestCase[]
}

export type ScheduleStatus = 'upcoming' | 'open' | 'closed'
