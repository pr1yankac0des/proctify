import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'academyflow-test-'))
const dataPath = path.join(temporaryDirectory, 'data.json')
await writeFile(dataPath, JSON.stringify({ tests: [], attempts: [], submissions: [], students: [], pendingVerifications: [] }))

const port = 3199
const baseUrl = `http://127.0.0.1:${port}/api`
const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    API_PORT: String(port),
    ADMIN_PASSWORD: 'smoke-test-password',
    DATA_STORE: 'local',
    DATA_PATH: dataPath,
    EMAIL_MODE: 'console',
    NODE_ENV: 'test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stderr = ''
server.stderr.on('data', (chunk) => { stderr += String(chunk) })

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`API did not start. ${stderr}`)
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options)
  const body = await response.json().catch(() => ({}))
  return { response, body }
}

function jsonOptions(method, body, token, tokenHeader = 'x-student-token') {
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { [tokenHeader]: token } : {}),
    },
    body: JSON.stringify(body),
  }
}

try {
  await waitForServer()
  const health = await request('/health')
  assert.deepEqual(health.body, { ok: true, service: 'academyflow-api' })
  assert.equal(health.response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal((await request('/tests')).response.status, 401)
  assert.equal((await request('/submissions/student?studentId=fake')).response.status, 401)

  const adminLogin = await request('/admin/login', jsonOptions('POST', { password: 'smoke-test-password' }))
  assert.equal(adminLogin.response.status, 200)
  const now = Date.now()
  const testPayload = {
    id: 'smoke-test', code: 'SMOKE', title: 'Smoke Test', description: 'Integration test',
    timeLimitMinutes: 10,
    scheduledStart: new Date(now - 60_000).toISOString(),
    scheduledEnd: new Date(now + 600_000).toISOString(),
    questions: [{ id: 'q1', text: 'Choose B', options: ['A', 'B', 'C', 'D'], correctIndex: 1, marks: 2 }],
    passMark: 50,
  }
  const createdTest = await request('/tests', jsonOptions('POST', testPayload, adminLogin.body.token, 'x-admin-token'))
  assert.equal(createdTest.response.status, 200)

  const signup = await request('/auth/signup', jsonOptions('POST', {
    fullName: 'Smoke Student', registrationNumber: 'SMOKE-001', email: 'smoke@example.test',
  }))
  assert.equal(signup.response.status, 200)
  assert.match(signup.body.devCode, /^\d{6}$/)
  const verification = await request('/auth/verify', jsonOptions('POST', {
    email: 'smoke@example.test', code: signup.body.devCode,
  }))
  assert.equal(verification.response.status, 200)
  const student = verification.body.student
  assert.ok(student.sessionToken)

  const accommodation = await request(`/students/${student.id}/accommodations`, jsonOptions(
    'PATCH', { extraTimeMinutes: 15 }, adminLogin.body.token, 'x-admin-token'
  ))
  assert.equal(accommodation.response.status, 200)
  assert.equal(accommodation.body.extraTimeMinutes, 15)

  const publicTest = await request('/tests/smoke-test')
  assert.equal(publicTest.body.questions[0].correctIndex, -1, 'Answer key must stay private before submission')

  const [attempt, concurrentAttempt] = await Promise.all([
    request('/attempts/start', jsonOptions('POST', {
      testId: 'smoke-test', monitoringConsent: true,
    }, student.sessionToken)),
    request('/attempts/start', jsonOptions('POST', {
      testId: 'smoke-test', monitoringConsent: true,
    }, student.sessionToken)),
  ])
  assert.deepEqual([attempt.response.status, concurrentAttempt.response.status].sort(), [200, 201])
  assert.equal(concurrentAttempt.body.id, attempt.body.id, 'Concurrent starts must reuse one attempt')
  assert.equal(attempt.body.answers.length, 1)
  const allowedMinutes = Math.round(
    (new Date(attempt.body.expiresAt).getTime() - new Date(attempt.body.startedAt).getTime()) / 60_000
  )
  assert.equal(allowedMinutes, 25, 'Student accommodation must extend server-owned time')
  const saved = await request(`/attempts/${attempt.body.id}`, jsonOptions('PATCH', {
    answers: [1], flaggedQuestions: [0], currentIndex: 0, proctorEvents: [],
  }, student.sessionToken))
  assert.equal(saved.response.status, 200)
  assert.deepEqual(saved.body.answers, [1])

  const submission = await request('/submissions', jsonOptions('POST', {
    attemptId: attempt.body.id,
    testId: 'smoke-test', studentId: student.id, answers: [1], score: 999,
    durationSeconds: 999999, proctorEvents: [],
  }, student.sessionToken))
  assert.equal(submission.response.status, 200)
  assert.equal(submission.body.score, 2, 'Server must calculate the score')
  assert.equal(submission.body.totalMarks, 2)
  assert.equal(submission.body.correctAnswers, undefined, 'Answer review must stay locked while the test is open')
  const adminSubmissions = await request('/submissions', {
    headers: { 'x-admin-token': adminLogin.body.token },
  })
  assert.deepEqual(adminSubmissions.body[0].correctAnswers, [1], 'Admins retain the answer key')

  const duplicate = await request('/submissions', jsonOptions('POST', {
    attemptId: attempt.body.id, testId: 'smoke-test', studentId: student.id, answers: [1], proctorEvents: [],
  }, student.sessionToken))
  assert.equal(duplicate.response.status, 409)

  const model = await stat(path.join(projectRoot, 'public', 'models', 'blaze_face_short_range.tflite'))
  assert.ok(model.size > 200_000, 'Face detector model asset is missing or incomplete')
  console.log('Integration tests passed: auth, private answers, attempts, autosave, scoring, duplicate blocking, and ML asset.')
} finally {
  server.kill('SIGTERM')
  await new Promise((resolve) => server.once('exit', resolve))
  await rm(temporaryDirectory, { recursive: true, force: true })
}
