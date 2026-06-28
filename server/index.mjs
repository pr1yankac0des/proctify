import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import helmet from 'helmet'
import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import { connectDB, readData, writeData, generateId } from './store.mjs'
import { sendVerificationEmail } from './email.mjs'
import { exec } from 'child_process'
import { promises as fsPromises } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))


dotenv.config()

const app = express()
const PORT = process.env.API_PORT || 3001
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234'
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1)

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  ...(process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',').map((origin) => origin.trim()) : []),
]

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }))

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
      cb(new Error(`CORS: origin ${origin} not allowed`))
    },
    credentials: true,
  })
)
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'academyflow-api' })
})

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const rateLimitMap = new Map()
const RATE_LIMIT = 15
const RATE_WINDOW = 60 * 1000
let rateLimitRequests = 0

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown'
  const now = Date.now()
  rateLimitRequests++
  if (rateLimitRequests % 100 === 0) {
    for (const [key, value] of rateLimitMap) {
      if (now > value.resetAt) rateLimitMap.delete(key)
    }
  }
  let entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW }
    rateLimitMap.set(ip, entry)
  }
  entry.count++
  if (entry.count > RATE_LIMIT) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000))
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' })
  }
  next()
}

let mutationQueue = Promise.resolve()
function serializeMutation(handler) {
  return (req, res, next) => {
    const operation = mutationQueue.then(() => handler(req, res, next))
    mutationQueue = operation.catch(() => undefined)
    return operation.catch(next)
  }
}

// ─── Input Sanitization ───────────────────────────────────────────────────────

function sanitizeString(val, maxLen = 512) {
  if (typeof val !== 'string') return ''
  return val.trim().slice(0, maxLen)
}

// ─── Admin Auth (stateless HMAC — survives restarts) ─────────────────────────

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const STUDENT_TOKEN_TTL_MS = 12 * 60 * 60 * 1000

function generateAdminToken() {
  const payload = `adm:${Date.now()}`
  const sig = createHmac('sha256', ADMIN_PASSWORD).update(payload).digest('hex')
  return `${payload}:${sig}`
}

function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return false
  const parts = token.split(':')
  if (parts.length !== 3 || parts[0] !== 'adm') return false
  const timestamp = parseInt(parts[1], 10)
  if (isNaN(timestamp) || timestamp > Date.now() + 60_000 || Date.now() - timestamp > TOKEN_TTL_MS) return false
  const payload = `${parts[0]}:${parts[1]}`
  const expectedSig = createHmac('sha256', ADMIN_PASSWORD).update(payload).digest('hex')
  const actual = Buffer.from(parts[2], 'hex')
  const expected = Buffer.from(expectedSig, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token']
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: 'Unauthorized. Admin token required.' })
  }
  next()
}

function generateStudentToken(studentId) {
  const timestamp = Date.now()
  const payload = `stu:${studentId}:${timestamp}`
  const signature = createHmac('sha256', ADMIN_PASSWORD).update(payload).digest('hex')
  return `${payload}:${signature}`
}

function verifyStudentToken(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split(':')
  if (parts.length !== 4 || parts[0] !== 'stu') return null
  const timestamp = Number(parts[2])
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 60_000 || Date.now() - timestamp > STUDENT_TOKEN_TTL_MS) {
    return null
  }
  const payload = `${parts[0]}:${parts[1]}:${parts[2]}`
  const expected = Buffer.from(createHmac('sha256', ADMIN_PASSWORD).update(payload).digest('hex'), 'hex')
  const actual = Buffer.from(parts[3], 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? parts[1] : null
}

function requireStudent(req, res, next) {
  const studentId = verifyStudentToken(req.headers['x-student-token'])
  if (!studentId) return res.status(401).json({ error: 'Student session expired. Please sign in again.' })
  req.studentId = studentId
  next()
}

app.post('/api/admin/login', rateLimit, (req, res) => {
  const { password } = req.body
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' })
  }
  res.json({ token: generateAdminToken() })
})

app.post('/api/admin/logout', (_req, res) => {
  res.json({ ok: true })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFilename(lang) {
  const l = String(lang || '').toLowerCase()
  if (l.includes('python')) return 'main.py'
  if (l.includes('javascript') || l.includes('js')) return 'main.js'
  if (l.includes('typescript') || l.includes('ts')) return 'main.ts'
  if (l.includes('c++') || l.includes('cpp')) return 'main.cpp'
  if (l.includes('java')) return 'Main.java'
  if (l.includes('c')) return 'main.c'
  return 'main'
}

async function executeLocal(language, code, stdin) {
  const lang = String(language).toLowerCase()
  let command = ''
  let extension = ''
  if (lang.includes('python')) {
    command = 'python'
    extension = 'py'
  } else if (lang.includes('javascript') || lang.includes('js')) {
    command = 'node'
    extension = 'js'
  } else {
    throw new Error(`Local execution not supported for language: ${language}`)
  }

  const tempDir = path.join(__dirname, 'temp_runs')
  await fsPromises.mkdir(tempDir, { recursive: true })
  const fileName = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${extension}`
  const filePath = path.join(tempDir, fileName)
  await fsPromises.writeFile(filePath, code)

  return new Promise((resolve) => {
    const fullCommand = `${command} "${filePath}"`
    const child = exec(fullCommand, { timeout: 8000 }, async (error, stdout, stderr) => {
      try {
        await fsPromises.unlink(filePath)
      } catch {}
      if (error && error.killed) {
        return resolve({
          run: {
            stdout: '',
            stderr: 'Execution timed out (limit: 8 seconds)',
            output: 'Execution timed out (limit: 8 seconds)'
          }
        })
      }
      const outVal = stdout || ''
      const errVal = stderr || ''
      resolve({
        run: {
          stdout: outVal,
          stderr: errVal,
          output: outVal + errVal
        }
      })
    })

    if (stdin) {
      child.stdin.write(stdin)
      child.stdin.end()
    }
  })
}

function generateCode() {
  return String(randomInt(100000, 1000000))
}

function publicTest(test) {
  return {
    ...test,
    questions: Array.isArray(test.questions)
      ? test.questions.map(({ correctIndex: _correctIndex, ...question }) => ({
          ...question,
          correctIndex: -1,
          testCases: Array.isArray(question.testCases)
            ? question.testCases.map((tc) =>
                tc.isHidden ? { isHidden: true, input: 'Hidden Test Case', expectedOutput: 'Hidden Expected Output' } : tc
              )
            : undefined,
        }))
      : [],
  }
}

function studentSubmission(data, submission) {
  const test = data.tests.find((item) => item.id === submission.testId)
  if (test && Date.now() < new Date(test.scheduledEnd).getTime()) {
    const { correctAnswers: _correctAnswers, ...safe } = submission
    return safe
  }
  return submission
}

function validatedTest(input) {
  const title = sanitizeString(input?.title, 200)
  const code = sanitizeString(input?.code, 50)
  const description = sanitizeString(input?.description, 2000)
  const timeLimitMinutes = Number(input?.timeLimitMinutes)
  const scheduledStart = new Date(input?.scheduledStart)
  const scheduledEnd = new Date(input?.scheduledEnd)
  if (!title || !code) throw new Error('Test title and code are required.')
  if (!Number.isFinite(timeLimitMinutes) || timeLimitMinutes < 1 || timeLimitMinutes > 480) {
    throw new Error('Time limit must be between 1 and 480 minutes.')
  }
  if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime()) || scheduledStart >= scheduledEnd) {
    throw new Error('A valid schedule with an end after the start is required.')
  }
  if (!Array.isArray(input?.questions) || input.questions.length < 1 || input.questions.length > 500) {
    throw new Error('A test must contain between 1 and 500 questions.')
  }
  const questions = input.questions.map((question, index) => {
    const text = sanitizeString(question?.text, 4000)
    if (!text) throw new Error(`Question ${index + 1} requires text.`)
    const type = question?.type === 'coding' ? 'coding' : 'mcq'
    const marks = Number(question.marks ?? 1)
    if (!Number.isFinite(marks) || marks < 1 || marks > 100) {
      throw new Error(`Question ${index + 1} marks must be between 1 and 100.`)
    }
    
    if (type === 'mcq') {
      const options = Array.isArray(question?.options)
        ? question.options.map((option) => sanitizeString(option, 2000))
        : []
      if (options.length !== 4 || options.some((option) => !option)) {
        throw new Error(`Question ${index + 1} requires four non-empty options.`)
      }
      if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) {
        throw new Error(`Question ${index + 1} has an invalid correct answer.`)
      }
      return {
        id: sanitizeString(question.id, 100) || generateId('question'),
        type,
        text,
        options,
        correctIndex: question.correctIndex,
        marks,
      }
    } else {
      // Coding
      const allowedLanguages = Array.isArray(question?.allowedLanguages) ? question.allowedLanguages.map(l => sanitizeString(l, 50)) : ['python', 'javascript']
      const starterCode = question?.starterCode && typeof question.starterCode === 'object' ? question.starterCode : {}
      const testCases = Array.isArray(question?.testCases) ? question.testCases.map(tc => ({
        input: String(tc.input || ''),
        expectedOutput: String(tc.expectedOutput || ''),
        isHidden: Boolean(tc.isHidden)
      })) : []
      return {
        id: sanitizeString(question.id, 100) || generateId('question'),
        type,
        text,
        marks,
        allowedLanguages,
        starterCode,
        testCases,
      }
    }
  })
  const passMark = Number(input.passMark ?? 50)
  if (!Number.isFinite(passMark) || passMark < 0 || passMark > 100) {
    throw new Error('Pass mark must be between 0 and 100 percent.')
  }
  const allowMultipleAttempts = Boolean(input.allowMultipleAttempts)
  const enableAIProctoring = input.enableAIProctoring !== undefined ? Boolean(input.enableAIProctoring) : true
  const enableVoiceTranscription = Boolean(input.enableVoiceTranscription)
  return {
    id: sanitizeString(input.id, 100) || generateId('test'),
    title,
    code,
    description,
    timeLimitMinutes,
    scheduledStart: scheduledStart.toISOString(),
    scheduledEnd: scheduledEnd.toISOString(),
    questions,
    passMark,
    allowMultipleAttempts,
    enableAIProctoring,
    enableVoiceTranscription,
  }
}

function findStudent(data, registrationNumber, email) {
  const reg = registrationNumber.trim().toLowerCase()
  const em = email.trim().toLowerCase()
  return data.students.find(
    (s) => s.registrationNumber.toLowerCase() === reg && s.email.toLowerCase() === em
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

app.get('/api/tests/:id', async (req, res) => {
  const data = await readData()
  const test = data.tests.find((t) => t.id === req.params.id || t.code === req.params.id)
  if (!test) return res.status(404).json({ error: 'Test not found' })
  // Never expose the answer key before a student submits the assessment.
  res.json(publicTest(test))
})

app.get('/api/tests', requireAdmin, async (_req, res) => {
  const data = await readData()
  res.json(data.tests)
})

app.post('/api/tests', requireAdmin, async (req, res) => {
  const data = await readData()
  let test
  try {
    test = validatedTest(req.body)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
  const duplicateCode = data.tests.some(
    (item) => item.id !== test.id && item.code.toLowerCase() === test.code.toLowerCase()
  )
  if (duplicateCode) return res.status(409).json({ error: 'Test code is already in use.' })
  const idx = data.tests.findIndex((t) => t.id === test.id)
  if (idx >= 0) data.tests[idx] = test
  else data.tests.push(test)
  await writeData(data)
  res.json(test)
})

app.delete('/api/tests/:id', requireAdmin, async (req, res) => {
  const data = await readData()
  data.tests = data.tests.filter((t) => t.id !== req.params.id)
  data.attempts = data.attempts.filter((attempt) => attempt.testId !== req.params.id)
  await writeData(data)
  res.json({ ok: true })
})

// ─── Exam Attempts ────────────────────────────────────────────────────────────

function sanitizeAnswers(answers, test) {
  if (!Array.isArray(answers) || answers.length !== test.questions.length) return null
  return answers.map((answer, index) => {
    if (answer === null) return null
    const question = test.questions[index]
    if (question?.type === 'coding') {
      if (typeof answer === 'object' && answer !== null && typeof answer.code === 'string' && typeof answer.language === 'string') {
        return { code: sanitizeString(answer.code, 100000), language: sanitizeString(answer.language, 50) }
      }
      return null
    }
    const options = question?.options
    return Number.isInteger(answer) && Array.isArray(options) && answer >= 0 && answer < options.length
      ? answer
      : null
  })
}

function sanitizeProctorEvents(events) {
  return Array.isArray(events)
    ? events.slice(-1000).map((event) => ({
        timestamp: sanitizeString(event?.timestamp, 50),
        message: sanitizeString(event?.message, 500),
      })).filter((event) => event.timestamp && event.message)
    : []
}

app.get('/api/attempts/:testId', requireStudent, async (req, res) => {
  const data = await readData()
  const attempt = data.attempts.find(
    (item) => item.testId === req.params.testId && item.studentId === req.studentId && item.status === 'active'
  )
  res.json(attempt || null)
})

app.post('/api/attempts/start', requireStudent, serializeMutation(async (req, res) => {
  const data = await readData()
  if (req.body.monitoringConsent !== true) {
    return res.status(400).json({ error: 'Monitoring consent is required before starting the exam.' })
  }
  const test = data.tests.find((item) => item.id === req.body.testId || item.code === req.body.testId)
  if (!test) return res.status(404).json({ error: 'Test not found.' })
  const now = new Date()
  if (now < new Date(test.scheduledStart) || now > new Date(test.scheduledEnd)) {
    return res.status(403).json({ error: 'This test is not currently within its scheduled window.' })
  }
  if (!test.allowMultipleAttempts && data.submissions.some((item) => item.testId === test.id && item.studentId === req.studentId)) {
    return res.status(409).json({ error: 'You have already attempted this test.' })
  }
  const existing = data.attempts.find(
    (item) => item.testId === test.id && item.studentId === req.studentId && item.status === 'active'
  )
  if (existing) return res.json(existing)

  const startedAt = now.toISOString()
  const attempt = {
    id: generateId('attempt'),
    testId: test.id,
    studentId: req.studentId,
    startedAt,
    expiresAt: new Date(now.getTime() + (test.timeLimitMinutes + (data.students.find(
      (student) => student.id === req.studentId
    )?.extraTimeMinutes ?? 0)) * 60_000).toISOString(),
    answers: test.questions.map(() => null),
    flaggedQuestions: [],
    currentIndex: 0,
    proctorEvents: [],
    lastSavedAt: startedAt,
    monitoringConsentedAt: startedAt,
    status: 'active',
  }
  data.attempts.push(attempt)
  await writeData(data)
  res.status(201).json(attempt)
}))

app.patch('/api/attempts/:id', requireStudent, serializeMutation(async (req, res) => {
  const data = await readData()
  const attempt = data.attempts.find((item) => item.id === req.params.id)
  if (!attempt) return res.status(404).json({ error: 'Exam attempt not found.' })
  if (attempt.studentId !== req.studentId) return res.status(403).json({ error: 'Student identity mismatch.' })
  if (attempt.status !== 'active') return res.status(409).json({ error: 'This exam attempt is already closed.' })
  if (Date.now() > new Date(attempt.expiresAt).getTime()) {
    return res.status(409).json({ error: 'The exam time has expired. Submit the last saved answers.' })
  }
  const test = data.tests.find((item) => item.id === attempt.testId)
  if (!test) return res.status(404).json({ error: 'Test not found.' })
  const answers = sanitizeAnswers(req.body.answers, test)
  if (!answers) return res.status(400).json({ error: 'Answers do not match this test.' })

  attempt.answers = answers
  attempt.flaggedQuestions = Array.isArray(req.body.flaggedQuestions)
    ? [...new Set(req.body.flaggedQuestions.filter(
        (index) => Number.isInteger(index) && index >= 0 && index < test.questions.length
      ))]
    : attempt.flaggedQuestions
  attempt.currentIndex = Number.isInteger(req.body.currentIndex)
    ? Math.max(0, Math.min(req.body.currentIndex, test.questions.length - 1))
    : attempt.currentIndex
  attempt.proctorEvents = sanitizeProctorEvents(req.body.proctorEvents)
  attempt.lastSavedAt = new Date().toISOString()
  await writeData(data)
  res.json(attempt)
}))

app.post('/api/execute', requireStudent, async (req, res) => {
  const { language, code, stdin, testId, questionId } = req.body
  if (!language || !code) {
    return res.status(400).json({ error: 'Language and code are required.' })
  }

  // If both testId and questionId are present, run full secure test case suite evaluation
  if (testId && questionId) {
    try {
      const data = await readData()
      const test = data.tests.find((t) => t.id === testId || t.code === testId)
      if (!test) return res.status(404).json({ error: 'Test template not found.' })
      const question = test.questions.find((q) => q.id === questionId)
      if (!question) return res.status(404).json({ error: 'Question not found.' })

      const testCases = question.testCases || []
      const results = await Promise.all(
        testCases.map(async (tc) => {
          try {
            let runResult
            const pistonUrl = process.env.PISTON_URL || 'https://emkc.org/api/v2/piston/execute'
            const pistonKey = process.env.PISTON_API_KEY
            try {
              const headers = { 'Content-Type': 'application/json' }
              if (pistonKey) {
                headers['Authorization'] = pistonKey
              }
              const response = await fetch(pistonUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  language,
                  version: '*',
                  files: [{ name: getFilename(language), content: code }],
                  stdin: tc.input,
                }),
              })
              runResult = await response.json()
              if (runResult.message && runResult.message.includes('whitelist')) {
                runResult = await executeLocal(language, code, tc.input)
              }
            } catch {
              runResult = await executeLocal(language, code, tc.input)
            }

            const output = (runResult.run?.stdout || runResult.run?.output || '').trim()
            const passed = output === tc.expectedOutput.trim()
            return {
              passed,
              output: tc.isHidden ? null : output,
              isHidden: tc.isHidden,
            }
          } catch (e) {
            return {
              passed: false,
              output: tc.isHidden ? null : 'Execution error: ' + e.message,
              isHidden: tc.isHidden,
            }
          }
        })
      )

      const publicResults = results
        .filter((r) => !r.isHidden)
        .map((r) => ({ passed: r.passed, output: r.output }))
      const hiddenResults = results.filter((r) => r.isHidden)
      const passedHidden = hiddenResults.filter((r) => r.passed).length
      const totalHidden = hiddenResults.length

      const totalPassed = results.filter((r) => r.passed).length
      const maxMarks = question.marks ?? 1
      const earnedMarks = testCases.length > 0 ? (totalPassed / testCases.length) * maxMarks : 0
      const roundedMarks = Math.round(earnedMarks * 100) / 100

      return res.json({
        publicResults,
        hiddenStats: {
          passed: passedHidden,
          total: totalHidden,
          allPassed: passedHidden === totalHidden,
        },
        earnedMarks: roundedMarks,
        maxMarks,
      })
    } catch (err) {
      return res.status(500).json({ error: 'Test suite evaluation failed: ' + err.message })
    }
  }

  // Fallback for single STDIN execution
  const pistonUrl = process.env.PISTON_URL || 'https://emkc.org/api/v2/piston/execute'
  const pistonKey = process.env.PISTON_API_KEY
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (pistonKey) {
      headers['Authorization'] = pistonKey
    }
    const response = await fetch(pistonUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        language,
        version: '*',
        files: [{ name: getFilename(language), content: code }],
        stdin: stdin || '',
      }),
    })
    const data = await response.json()
    if (data.message && data.message.includes('whitelist')) {
      const localResult = await executeLocal(language, code, stdin)
      return res.json(localResult)
    }
    res.json(data)
  } catch (error) {
    try {
      const localResult = await executeLocal(language, code, stdin)
      res.json(localResult)
    } catch (localErr) {
      res.status(500).json({ error: 'Code execution failed locally and remotely: ' + localErr.message })
    }
  }
})

// ─── Submissions ──────────────────────────────────────────────────────────────

app.get('/api/submissions', requireAdmin, async (req, res) => {
  const data = await readData()
  const { testId, studentId } = req.query
  let subs = data.submissions
  if (testId) subs = subs.filter((s) => s.testId === testId)
  if (studentId) subs = subs.filter((s) => s.studentId === studentId)
  res.json(subs)
})

app.get('/api/submissions/student', requireStudent, async (req, res) => {
  const data = await readData()
  const { testId, studentId } = req.query
  if (!studentId) return res.status(400).json({ error: 'studentId required' })
  if (studentId !== req.studentId) return res.status(403).json({ error: 'Student identity mismatch.' })
  let subs = data.submissions.filter((s) => s.studentId === studentId)
  if (testId) subs = subs.filter((s) => s.testId === testId)
  res.json(subs.map((submission) => studentSubmission(data, submission)))
})

app.post('/api/submissions', requireStudent, serializeMutation(async (req, res) => {
  const data = await readData()
  const { testId, studentId, attemptId } = req.body
  if (studentId !== req.studentId) return res.status(403).json({ error: 'Student identity mismatch.' })
  const test = data.tests.find((item) => item.id === testId)
  const student = data.students.find((item) => item.id === studentId)
  if (!test) return res.status(404).json({ error: 'Test not found.' })
  if (!student?.verified) return res.status(401).json({ error: 'Verified student account required.' })
  const attempt = data.attempts.find((item) => item.id === attemptId)
  if (!attempt || attempt.testId !== test.id || attempt.studentId !== student.id) {
    return res.status(400).json({ error: 'A valid server-issued exam attempt is required.' })
  }
  if (attempt.status !== 'active') return res.status(409).json({ error: 'This exam attempt is already closed.' })
  const submittedWithinGrace = Date.now() <= new Date(attempt.expiresAt).getTime() + 5000
  const answers = sanitizeAnswers(submittedWithinGrace ? req.body.answers : attempt.answers, test)
  if (!answers) {
    return res.status(400).json({ error: 'Answers do not match this test.' })
  }

  const existing = data.submissions.find(
    (s) => s.testId === testId && s.studentId === studentId
  )
  if (!test.allowMultipleAttempts && existing) {
    return res.status(409).json({ error: 'You have already attempted this test.' })
  }

  const correctAnswers = test.questions.map((question) => question.correctIndex ?? null)
  
  // Grade all questions concurrently (MCQs are instant, Coding questions invoke Piston API test cases in parallel)
  const questionGrades = await Promise.all(
    test.questions.map(async (question, index) => {
      const answer = answers[index]
      if (question.type === 'coding' && answer && typeof answer === 'object') {
        if (!Array.isArray(question.testCases) || question.testCases.length === 0) {
          return 0
        }
        try {
          const results = await Promise.all(
            question.testCases.map(async (tc) => {
              try {
                const pistonUrl = process.env.PISTON_URL || 'https://emkc.org/api/v2/piston/execute'
                const pistonKey = process.env.PISTON_API_KEY
                const headers = { 'Content-Type': 'application/json' }
                if (pistonKey) {
                  headers['Authorization'] = pistonKey
                }
                const res = await fetch(pistonUrl, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    language: answer.language,
                    version: '*',
                    files: [{ name: getFilename(answer.language), content: answer.code }],
                    stdin: tc.input,
                  }),
                })
                const out = await res.json()
                let output = ''
                if (out.message && out.message.includes('whitelist')) {
                  const localRes = await executeLocal(answer.language, answer.code, tc.input)
                  output = (localRes.run?.stdout || localRes.run?.output || '').trim()
                } else {
                  output = (out.run?.stdout || out.run?.output || '').trim()
                }
                return output === tc.expectedOutput.trim()
              } catch {
                try {
                  const localRes = await executeLocal(answer.language, answer.code, tc.input)
                  const output = (localRes.run?.stdout || localRes.run?.output || '').trim()
                  return output === tc.expectedOutput.trim()
                } catch {
                  return false
                }
              }
            })
          )
          const passedCount = results.filter((r) => r === true).length
          const maxMarks = question.marks ?? 1
          const earnedMarks = (passedCount / question.testCases.length) * maxMarks
          return Math.round(earnedMarks * 100) / 100
        } catch {
          return 0
        }
      } else {
        // MCQ
        return answer === question.correctIndex ? (question.marks ?? 1) : 0
      }
    })
  )
  const score = questionGrades.reduce((a, b) => a + b, 0)
  const totalMarks = test.questions.reduce((total, question) => total + (question.marks ?? 1), 0)
  const durationSeconds = Math.max(0, Math.min(
    Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000),
    Math.floor((new Date(attempt.expiresAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000)
  ))
  const proctorEvents = sanitizeProctorEvents(req.body.proctorEvents)
  const submission = {
    id: generateId('sub'),
    testId: test.id,
    testTitle: test.title,
    studentId: student.id,
    candidateName: student.fullName,
    registrationNumber: student.registrationNumber,
    email: student.email,
    answers,
    correctAnswers,
    score,
    totalQuestions: test.questions.length,
    totalMarks,
    durationSeconds,
    submittedAt: new Date().toISOString(),
    proctorEvents,
    active: true,
  }
  data.submissions.push(submission)
  attempt.status = 'submitted'
  attempt.answers = answers
  attempt.proctorEvents = proctorEvents
  attempt.lastSavedAt = submission.submittedAt
  await writeData(data)
  res.json(studentSubmission(data, submission))
}))

app.delete('/api/submissions/:id', requireAdmin, async (req, res) => {
  const data = await readData()
  const exists = data.submissions.find((s) => s.id === req.params.id)
  if (!exists) return res.status(404).json({ error: 'Submission not found' })
  data.submissions = data.submissions.filter((s) => s.id !== req.params.id)
  await writeData(data)
  res.json({ ok: true })
})

// ─── Students ─────────────────────────────────────────────────────────────────

app.get('/api/students', requireAdmin, async (_req, res) => {
  const data = await readData()
  const safe = data.students.map(({ id, fullName, registrationNumber, email, verified, createdAt, extraTimeMinutes }) => ({
    id, fullName, registrationNumber, email, verified, createdAt, extraTimeMinutes: extraTimeMinutes ?? 0,
  }))
  res.json(safe)
})

app.patch('/api/students/:id/accommodations', requireAdmin, async (req, res) => {
  const data = await readData()
  const student = data.students.find((item) => item.id === req.params.id)
  if (!student) return res.status(404).json({ error: 'Student not found.' })
  const extraTimeMinutes = Number(req.body.extraTimeMinutes)
  if (!Number.isInteger(extraTimeMinutes) || extraTimeMinutes < 0 || extraTimeMinutes > 240) {
    return res.status(400).json({ error: 'Extra time must be a whole number from 0 to 240 minutes.' })
  }
  student.extraTimeMinutes = extraTimeMinutes
  await writeData(data)
  res.json({
    id: student.id,
    fullName: student.fullName,
    registrationNumber: student.registrationNumber,
    email: student.email,
    verified: student.verified,
    createdAt: student.createdAt,
    extraTimeMinutes,
  })
})

app.delete('/api/students/:id', requireAdmin, async (req, res) => {
  const data = await readData()
  const exists = data.students.find((s) => s.id === req.params.id)
  if (!exists) return res.status(404).json({ error: 'Student not found' })
  data.students = data.students.filter((s) => s.id !== req.params.id)
  data.attempts = data.attempts.filter((attempt) => attempt.studentId !== req.params.id)
  data.submissions = data.submissions.filter((s) => s.studentId !== req.params.id)
  data.pendingVerifications = data.pendingVerifications.filter((p) => p.studentId !== req.params.id)
  await writeData(data)
  res.json({ ok: true })
})

// ─── Auth ─────────────────────────────────────────────────────────────────────

app.post('/api/auth/signup', rateLimit, async (req, res) => {
  const fullName = sanitizeString(req.body.fullName, 100)
  const registrationNumber = sanitizeString(req.body.registrationNumber, 50)
  const email = sanitizeString(req.body.email, 200)

  if (!fullName || !registrationNumber || !email) {
    return res.status(400).json({ error: 'Full name, registration number, and email are required.' })
  }

  const data = await readData()
  const reg = registrationNumber.trim()
  const em = email.trim().toLowerCase()

  const regTaken = data.students.find(
    (s) => s.registrationNumber.toLowerCase() === reg.toLowerCase()
  )
  if (regTaken && regTaken.email.toLowerCase() !== em) {
    return res.status(409).json({ error: 'Registration number already in use.' })
  }

  const emailTaken = data.students.find((s) => s.email.toLowerCase() === em)
  if (emailTaken && emailTaken.registrationNumber.toLowerCase() !== reg.toLowerCase()) {
    return res.status(409).json({ error: 'Email already registered with a different registration number.' })
  }

  let student = findStudent(data, reg, em)
  if (!student) {
    student = {
      id: generateId('student'),
      fullName,
      registrationNumber: reg,
      email: em,
      verified: false,
      createdAt: new Date().toISOString(),
    }
    data.students.push(student)
  } else {
    student.fullName = fullName
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  data.pendingVerifications = data.pendingVerifications.filter((p) => p.email !== em)
  data.pendingVerifications.push({ email: em, code, expiresAt, studentId: student.id })

  await writeData(data)

  const emailResult = await sendVerificationEmail(em, code)
  res.json({
    message: emailResult.sent
      ? 'Verification code sent to your email.'
      : 'SMTP not configured — use the code shown below (dev mode).',
    studentId: student.id,
    requiresVerification: !student.verified,
    devCode: emailResult.devCode,
  })
})

app.post('/api/auth/verify', rateLimit, async (req, res) => {
  const email = sanitizeString(req.body.email, 200)
  const code = sanitizeString(req.body.code, 10)

  if (!email || !code) {
    return res.status(400).json({ error: 'Email and verification code are required.' })
  }

  const data = await readData()
  const em = email.trim().toLowerCase()
  const pending = data.pendingVerifications.find((p) => p.email === em)

  if (!pending) return res.status(400).json({ error: 'No pending verification. Please sign up again.' })
  if (new Date(pending.expiresAt) < new Date()) return res.status(400).json({ error: 'Verification code expired. Request a new one.' })
  if (pending.code !== code.trim()) return res.status(400).json({ error: 'Invalid verification code.' })

  const student = data.students.find((s) => s.id === pending.studentId)
  if (!student) return res.status(404).json({ error: 'Student not found.' })

  student.verified = true
  data.pendingVerifications = data.pendingVerifications.filter((p) => p.email !== em)
  await writeData(data)

  res.json({
    student: {
      id: student.id,
      fullName: student.fullName,
      registrationNumber: student.registrationNumber,
      email: student.email,
      verified: true,
      sessionToken: generateStudentToken(student.id),
    },
  })
})

app.post('/api/auth/resend', rateLimit, async (req, res) => {
  const registrationNumber = sanitizeString(req.body.registrationNumber, 50)
  const email = sanitizeString(req.body.email, 200)
  const data = await readData()
  const student = findStudent(data, registrationNumber, email)

  if (!student) return res.status(404).json({ error: 'Account not found. Please sign up first.' })

  const code = generateCode()
  const em = student.email.toLowerCase()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  data.pendingVerifications = data.pendingVerifications.filter((p) => p.email !== em)
  data.pendingVerifications.push({ email: em, code, expiresAt, studentId: student.id })
  await writeData(data)

  const emailResult = await sendVerificationEmail(em, code)
  res.json({
    message: emailResult.sent ? 'New code sent.' : 'SMTP not configured — dev code below.',
    devCode: emailResult.devCode,
  })
})

app.post('/api/auth/login', rateLimit, async (req, res) => {
  const registrationNumber = sanitizeString(req.body.registrationNumber, 50)
  const email = sanitizeString(req.body.email, 200)
  const data = await readData()
  const student = findStudent(data, registrationNumber, email)

  if (!student) return res.status(404).json({ error: 'Account not found. Please sign up first.' })

  const code = generateCode()
  const em = student.email.toLowerCase()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  data.pendingVerifications = data.pendingVerifications.filter((pending) => pending.email !== em)
  data.pendingVerifications.push({ email: em, code, expiresAt, studentId: student.id })
  await writeData(data)
  const emailResult = await sendVerificationEmail(em, code)
  res.json({
    requiresVerification: true,
    message: student.verified ? 'A sign-in code has been sent to your email.' : 'Email not verified. A verification code has been sent.',
    devCode: emailResult.devCode,
  })
})

app.use((error, _req, res, _next) => {
  console.error('Request failed:', error.message)
  if (error.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Origin not allowed.' })
  }
  res.status(500).json({ error: 'Internal server error.' })
})

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  const mongoConnected = await connectDB()
  if (process.env.NODE_ENV === 'production' && ADMIN_PASSWORD === 'admin1234') {
    throw new Error('ADMIN_PASSWORD must be changed before starting in production.')
  }
  app.listen(PORT, () => {
    console.log(`AcademyFlow API running on http://localhost:${PORT}`)
    console.log(`Admin password: ${ADMIN_PASSWORD === 'admin1234' ? '⚠️  Using default! Set ADMIN_PASSWORD in .env' : '✓ Custom password set'}`)
    console.log(`Storage: ${mongoConnected ? '✓ MongoDB connected' : '⚠️  Using local data.json'}`)
  })
}

start().catch((error) => {
  console.error('AcademyFlow API failed to start:', error.message)
  process.exitCode = 1
})
