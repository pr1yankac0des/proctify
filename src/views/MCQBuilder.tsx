import {
  AlertTriangle,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Plus,
  Save,
  Trash2,
  Code2,
  List,
  Eye,
  EyeOff
} from 'lucide-react'
import { useState } from 'react'
import type { BuilderQuestion, Test, QuestionType, TestCase } from '../types'
import { generateId } from '../lib/storage'

const LABELS = ['A', 'B', 'C', 'D'] as const

function toDatetimeLocal(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  if (!iso) {
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() + 1)
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultEndFromStart(startLocal: string): string {
  const d = new Date(startLocal)
  d.setHours(d.getHours() + 2)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function emptyQuestion(type: QuestionType = 'mcq'): BuilderQuestion {
  if (type === 'coding') {
    return {
      id: generateId('bq'),
      type: 'coding',
      text: '',
      marks: 10,
      allowedLanguages: ['python', 'javascript'],
      starterCode: { python: 'def solve():\n    pass', javascript: 'function solve() {\n\n}' },
      testCases: [{ input: '', expectedOutput: '', isHidden: false }],
    }
  }
  return {
    id: generateId('bq'),
    type: 'mcq',
    text: '',
    options: ['', '', '', ''],
    correctIndex: null,
    marks: 1,
  }
}

interface MCQBuilderProps {
  editingTest?: Test
  onSave: (test: Test) => void
  onCancel: () => void
}

export function MCQBuilder({ editingTest, onSave, onCancel }: MCQBuilderProps) {
  const [title, setTitle] = useState(editingTest?.title ?? '')
  const [description, setDescription] = useState(editingTest?.description ?? '')
  const [timeLimit, setTimeLimit] = useState(editingTest?.timeLimitMinutes ?? 15)
  const [passMark, setPassMark] = useState(editingTest?.passMark ?? 50)
  const [scheduledStart, setScheduledStart] = useState(
    toDatetimeLocal(editingTest?.scheduledStart)
  )
  const [scheduledEnd, setScheduledEnd] = useState(
    toDatetimeLocal(editingTest?.scheduledEnd || defaultEndFromStart(toDatetimeLocal()))
  )
  const [code, setCode] = useState(editingTest?.code ?? '')
  const [allowMultipleAttempts, setAllowMultipleAttempts] = useState(
    editingTest?.allowMultipleAttempts ?? false
  )
  const [enableAIProctoring, setEnableAIProctoring] = useState(
    editingTest?.enableAIProctoring !== false
  )
  const [enableVoiceTranscription, setEnableVoiceTranscription] = useState(
    editingTest?.enableVoiceTranscription ?? false
  )
  const [questions, setQuestions] = useState<BuilderQuestion[]>(
    editingTest
      ? editingTest.questions.map((q) => ({
          id: q.id,
          type: q.type || 'mcq',
          text: q.text,
          options: q.options ? [...q.options] as [string, string, string, string] : undefined,
          correctIndex: q.correctIndex,
          marks: q.marks ?? 1,
          allowedLanguages: q.allowedLanguages,
          starterCode: q.starterCode,
          testCases: q.testCases ? [...q.testCases] : undefined,
        }))
      : [emptyQuestion()]
  )
  const [errors, setErrors] = useState<string[]>([])
  const [shake, setShake] = useState(false)

  const totalMarks = questions.reduce((s, q) => s + (q.marks ?? 1), 0)
  const recommendedMax = Math.floor(timeLimit * 1.5)
  const tooManyQuestions = questions.filter(q => q.type === 'mcq').length > recommendedMax

  const updateQuestion = (id: string, patch: Partial<BuilderQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }

  const updateOption = (qId: string, optIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q
        const opts = [...(q.options || ['', '', '', ''])] as [string, string, string, string]
        opts[optIndex] = value
        return { ...q, options: opts }
      })
    )
  }

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const next = index + direction
    if (next < 0 || next >= questions.length) return
    const copy = [...questions]
    ;[copy[index], copy[next]] = [copy[next], copy[index]]
    setQuestions(copy)
  }

  const removeQuestion = (id: string) => {
    if (questions.length <= 1) return
    setQuestions((prev) => prev.filter((q) => q.id !== id))
  }

  const addTestCase = (qId: string) => {
    setQuestions((prev) => prev.map((q) => {
      if (q.id !== qId) return q
      const testCases = [...(q.testCases || []), { input: '', expectedOutput: '', isHidden: false }]
      return { ...q, testCases }
    }))
  }

  const updateTestCase = (qId: string, tcIndex: number, patch: Partial<TestCase>) => {
    setQuestions((prev) => prev.map((q) => {
      if (q.id !== qId) return q
      const testCases = [...(q.testCases || [])]
      testCases[tcIndex] = { ...testCases[tcIndex], ...patch }
      return { ...q, testCases }
    }))
  }

  const removeTestCase = (qId: string, tcIndex: number) => {
    setQuestions((prev) => prev.map((q) => {
      if (q.id !== qId) return q
      const testCases = [...(q.testCases || [])]
      testCases.splice(tcIndex, 1)
      return { ...q, testCases }
    }))
  }

  const validate = (): string[] => {
    const errs: string[] = []
    if (!title.trim()) errs.push('Test title is required.')
    if (timeLimit < 1) errs.push('Time limit must be at least 1 minute.')
    if (passMark < 0 || passMark > 100) errs.push('Pass mark must be between 0 and 100.')
    if (!scheduledStart) errs.push('Scheduled start time is required.')
    if (!scheduledEnd) errs.push('Scheduled end time is required.')
    if (scheduledStart && scheduledEnd && new Date(scheduledEnd) <= new Date(scheduledStart)) {
      errs.push('Scheduled end must be after scheduled start.')
    }
    if (questions.length === 0) errs.push('At least one question is required.')
    questions.forEach((q, i) => {
      if (!q.text.trim()) errs.push(`Question ${i + 1}: scenario text is required.`)
      if ((q.marks ?? 1) < 1) errs.push(`Question ${i + 1}: marks must be at least 1.`)
      
      if (q.type === 'mcq') {
        q.options?.forEach((opt, oi) => {
          if (!opt.trim()) errs.push(`Question ${i + 1}: option ${LABELS[oi]} is required.`)
        })
        if (q.correctIndex === null || q.correctIndex === undefined) errs.push(`Question ${i + 1}: select the correct answer.`)
      } else {
        if (!q.testCases || q.testCases.length === 0) {
          errs.push(`Question ${i + 1}: at least one test case is required.`)
        } else {
          q.testCases.forEach((tc, ti) => {
            if (!tc.input.trim() && !tc.expectedOutput.trim()) errs.push(`Question ${i + 1}: test case ${ti + 1} is empty.`)
          })
        }
      }
    })
    return errs
  }

  const handlePublish = () => {
    const errs = validate()
    if (errs.length > 0) {
      setErrors(errs)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }
    setErrors([])

    const test: Test = {
      id: editingTest?.id ?? generateId('test'),
      code: code.trim() || `TEST-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      title: title.trim(),
      description: description.trim(),
      timeLimitMinutes: timeLimit,
      passMark,
      scheduledStart: new Date(scheduledStart).toISOString(),
      scheduledEnd: new Date(scheduledEnd).toISOString(),
      allowMultipleAttempts,
      enableAIProctoring,
      enableVoiceTranscription,
      questions: questions.map((q) => {
        if (q.type === 'mcq') {
          return {
            id: q.id,
            type: 'mcq',
            text: q.text.trim(),
            options: q.options?.map((o) => o.trim()) as [string, string, string, string],
            correctIndex: q.correctIndex!,
            marks: q.marks ?? 1,
          }
        }
        return {
          id: q.id,
          type: 'coding',
          text: q.text.trim(),
          marks: q.marks ?? 10,
          allowedLanguages: q.allowedLanguages || ['python', 'javascript'],
          starterCode: q.starterCode || {},
          testCases: (q.testCases || []).map((tc) => ({
            input: tc.input.trim(),
            expectedOutput: tc.expectedOutput.trim(),
            isHidden: tc.isHidden
          }))
        }
      }),
    }
    onSave(test)
  }

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="border border-paper-200 p-2 text-ink-700 transition-colors duration-150 hover:bg-paper-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-dark-bg"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="font-serif text-2xl font-medium text-ink-950 dark:text-paper-50">
            {editingTest ? 'Edit Assessment' : 'Assessment Builder'}
          </h2>
          <p className="text-sm text-ink-700 dark:text-paper-200">
            Configure metadata and assessment questions
          </p>
        </div>
      </div>

      {/* Metadata */}
      <div className="mb-8 space-y-4 border border-paper-200 bg-white p-6 dark:border-ink-700 dark:bg-ink-dark-surface">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-paper-200">
            Title <span className="text-signal-700 dark:text-signal-100">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Python Fundamentals — Module 3"
            className="w-full border border-paper-200 px-4 py-2.5 outline-none focus:border-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-paper-200">
            Code Identifier
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Auto-generated if empty"
            className="w-full border border-paper-200 px-4 py-2.5 font-mono outline-none focus:border-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-paper-200">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Syllabus and scope description"
            className="w-full border border-paper-200 px-4 py-2.5 outline-none focus:border-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-50"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-paper-200">
              Time Limit (minutes) <span className="text-signal-700 dark:text-signal-100">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              className="w-full border border-paper-200 px-4 py-2.5 font-mono outline-none focus:border-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-paper-200">
              Pass Mark (%) <span className="text-signal-700 dark:text-signal-100">*</span>
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={passMark}
              onChange={(e) => setPassMark(Number(e.target.value))}
              className="w-full border border-paper-200 px-4 py-2.5 font-mono outline-none focus:border-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-50"
            />
            <p className="mt-1 text-xs text-ink-500">Score ≥ {passMark}% → Pass</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-paper-200">
              Scheduled Start <span className="text-signal-700 dark:text-signal-100">*</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
              className="w-full border border-paper-200 px-4 py-2.5 font-mono text-sm outline-none focus:border-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-paper-200">
              Scheduled End <span className="text-signal-700 dark:text-signal-100">*</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledEnd}
              onChange={(e) => setScheduledEnd(e.target.value)}
              className="w-full border border-paper-200 px-4 py-2.5 font-mono text-sm outline-none focus:border-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-50"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            id="allowMultipleAttempts"
            type="checkbox"
            checked={allowMultipleAttempts}
            onChange={(e) => setAllowMultipleAttempts(e.target.checked)}
            className="h-4 w-4 border-paper-200 text-ink-950 focus:ring-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg"
          />
          <label htmlFor="allowMultipleAttempts" className="text-sm font-medium text-ink-700 dark:text-paper-200 select-none">
            Allow multiple exam attempts per student
          </label>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            id="enableAIProctoring"
            type="checkbox"
            checked={enableAIProctoring}
            onChange={(e) => setEnableAIProctoring(e.target.checked)}
            className="h-4 w-4 border-paper-200 text-ink-950 focus:ring-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg"
          />
          <label htmlFor="enableAIProctoring" className="text-sm font-medium text-ink-700 dark:text-paper-200 select-none">
            Enable AI Proctoring (Webcam camera monitoring, gaze tracking, cell phone detection)
          </label>
        </div>
        <div className="flex items-center gap-2 mt-2 pl-6">
          <input
            id="enableVoiceTranscription"
            type="checkbox"
            checked={enableVoiceTranscription}
            disabled={!enableAIProctoring}
            onChange={(e) => setEnableVoiceTranscription(e.target.checked)}
            className="h-4 w-4 border-paper-200 text-ink-950 focus:ring-ink-950 disabled:opacity-40 dark:border-ink-700 dark:bg-ink-dark-bg"
          />
          <label htmlFor="enableVoiceTranscription" className="text-sm font-medium text-ink-700 dark:text-paper-200 select-none">
            Also enable speech transcription (sends short audio clips to the browser's speech service — not fully on-device)
          </label>
        </div>
        <p className="text-xs text-ink-500 dark:text-ink-300 mt-1">
          Students can only start the test between these scheduled times. {allowMultipleAttempts ? 'Multiple attempts are permitted.' : 'Only one attempt is permitted.'} {enableAIProctoring ? 'Webcam monitoring & AI analysis is enabled.' : 'Camera monitoring is disabled; integrity tracks only tab shifts and copy-paste.'} {enableAIProctoring && enableVoiceTranscription ? 'Speech transcription is also enabled and requires disclosure to students (Chromium browsers only).' : ''}
        </p>
      </div>

      {/* Question count warning */}
      {tooManyQuestions && (
        <div className="mb-4 flex items-start gap-3 border border-brass-600 bg-brass-50 p-4 dark:border-brass-600 dark:bg-brass-100/10">
          <AlertTriangle className="h-5 w-5 shrink-0 text-brass-700 dark:text-brass-100" />
          <div>
            <p className="text-sm font-semibold text-brass-700 dark:text-brass-100">
              Too many MCQ questions for the time limit
            </p>
            <p className="mt-0.5 text-xs text-brass-700 dark:text-brass-100">
              Consider increasing the time limit or reducing the number of questions.
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink-950 dark:text-paper-50">Questions</h3>
          <p className="text-xs text-ink-500 dark:text-ink-300">
            {questions.length} question{questions.length !== 1 ? 's' : ''} · {totalMarks} total mark{totalMarks !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setQuestions((prev) => [...prev, emptyQuestion('mcq')])}
            className="flex items-center gap-1 border border-brass-600 px-3 py-2 text-sm font-medium text-brass-700 transition-colors duration-150 hover:bg-brass-50 dark:border-brass-600 dark:text-brass-100 dark:hover:bg-brass-100/10"
          >
            <List className="h-4 w-4" />
            Add MCQ
          </button>
          <button
            type="button"
            onClick={() => setQuestions((prev) => [...prev, emptyQuestion('coding')])}
            className="flex items-center gap-1 border border-verify-700 px-3 py-2 text-sm font-medium text-verify-700 transition-colors duration-150 hover:bg-verify-50 dark:border-verify-600 dark:text-verify-600 dark:hover:bg-verify-100/10"
          >
            <Code2 className="h-4 w-4" />
            Add Coding
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {questions.map((q, qi) => (
          <div
            key={q.id}
            className="border border-paper-200 bg-white p-5 dark:border-ink-700 dark:bg-ink-dark-surface"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`flex items-center gap-1.5 font-mono text-sm font-semibold ${q.type === 'coding' ? 'text-verify-700 dark:text-verify-600' : 'text-brass-700 dark:text-brass-100'}`}>
                  {q.type === 'coding' ? <Code2 className="h-4 w-4" /> : <List className="h-4 w-4" />}
                  Q{qi + 1}
                </span>
                <div className="flex items-center gap-1.5 ml-4">
                  <label className="text-xs text-ink-500 dark:text-ink-300">Marks:</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={q.marks ?? (q.type === 'coding' ? 10 : 1)}
                    onChange={(e) => updateQuestion(q.id, { marks: Math.max(1, Number(e.target.value)) })}
                    className="w-14 border border-paper-200 px-2 py-0.5 text-center font-mono text-sm outline-none focus:border-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-50"
                  />
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={qi === 0}
                  onClick={() => moveQuestion(qi, -1)}
                  className="p-1.5 text-ink-300 transition-colors duration-150 hover:bg-paper-100 hover:text-ink-700 disabled:opacity-30 dark:hover:bg-ink-dark-bg"
                  title="Move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={qi === questions.length - 1}
                  onClick={() => moveQuestion(qi, 1)}
                  className="p-1.5 text-ink-300 transition-colors duration-150 hover:bg-paper-100 hover:text-ink-700 disabled:opacity-30 dark:hover:bg-ink-dark-bg"
                  title="Move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={questions.length <= 1}
                  onClick={() => removeQuestion(q.id)}
                  className="p-1.5 text-signal-600 transition-colors duration-150 hover:bg-signal-50 hover:text-signal-700 disabled:opacity-30 dark:text-signal-100 dark:hover:bg-signal-100/10"
                  title="Discard question"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-paper-200">
                {q.type === 'coding' ? 'Problem Statement' : 'Question Text'}
              </label>
              <textarea
                value={q.text}
                onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                rows={q.type === 'coding' ? 4 : 2}
                placeholder={q.type === 'coding' ? "Describe the problem, input format, output format, and constraints..." : "Write the question..."}
                className="w-full border border-paper-200 px-4 py-2.5 outline-none focus:border-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-50 font-mono text-sm"
              />
            </div>

            {q.type === 'mcq' ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink-700 dark:text-paper-200">
                  Options & Correct Answer Key
                </p>
                {(q.options || ['', '', '', '']).map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-3">
                    <input
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={q.correctIndex === oi}
                      onChange={() => updateQuestion(q.id, { correctIndex: oi })}
                      className="h-4 w-4 accent-ink-950"
                    />
                    <span className="w-6 font-mono text-sm font-bold text-ink-500">{LABELS[oi]}</span>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => updateOption(q.id, oi, e.target.value)}
                      placeholder={`Option ${LABELS[oi]}`}
                      className="flex-1 border border-paper-200 px-3 py-2 outline-none focus:border-ink-950 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-50"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-ink-700 dark:text-paper-200">
                      Test Cases
                    </p>
                    <button
                      type="button"
                      onClick={() => addTestCase(q.id)}
                      className="flex items-center gap-1 text-xs font-medium text-brass-700 dark:text-brass-100 hover:underline"
                    >
                      <Plus className="h-3 w-3" /> Add Test Case
                    </button>
                  </div>
                  
                  {(!q.testCases || q.testCases.length === 0) ? (
                    <p className="text-xs text-ink-500 italic">No test cases added. At least one is required.</p>
                  ) : (
                    <div className="space-y-3">
                      {q.testCases.map((tc, tcIndex) => (
                        <div key={tcIndex} className="relative border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-dark-bg p-3">
                          <button
                            type="button"
                            onClick={() => removeTestCase(q.id, tcIndex)}
                            className="absolute top-2 right-2 text-ink-300 hover:text-signal-700 transition-colors dark:hover:text-signal-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-semibold text-ink-700 dark:text-paper-200">Case {tcIndex + 1}</span>
                            <button
                              type="button"
                              onClick={() => updateTestCase(q.id, tcIndex, { isHidden: !tc.isHidden })}
                              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium border transition-colors ${
                                tc.isHidden 
                                  ? 'bg-brass-100 text-brass-700 border-brass-600 dark:bg-brass-100/10 dark:text-brass-100 dark:border-brass-600' 
                                  : 'bg-verify-100 text-verify-700 border-verify-700 dark:bg-verify-100/10 dark:text-verify-600 dark:border-verify-600'
                              }`}
                            >
                              {tc.isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              {tc.isHidden ? 'Hidden during test' : 'Visible to student'}
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-ink-700 dark:text-paper-200">STDIN (Input)</label>
                              <textarea
                                value={tc.input}
                                onChange={(e) => updateTestCase(q.id, tcIndex, { input: e.target.value })}
                                rows={2}
                                className="w-full border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-dark-surface px-3 py-1.5 text-xs font-mono outline-none focus:border-ink-950"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-ink-700 dark:text-paper-200">STDOUT (Expected)</label>
                              <textarea
                                value={tc.expectedOutput}
                                onChange={(e) => updateTestCase(q.id, tcIndex, { expectedOutput: e.target.value })}
                                rows={2}
                                className="w-full border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-dark-surface px-3 py-1.5 text-xs font-mono outline-none focus:border-ink-950"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <div
          className={`mt-6 border border-signal-600 bg-signal-50 p-4 dark:border-signal-600 dark:bg-signal-100/10 ${shake ? 'animate-shake' : ''}`}
        >
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-signal-700 dark:text-signal-100">
            <AlertTriangle className="h-4 w-4" />
            Validation Errors
          </p>
          <ul className="list-inside list-disc space-y-1 text-sm text-signal-700 dark:text-signal-100">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={handlePublish}
          className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-ink-950 py-3 font-medium text-paper-50 transition-colors duration-150 hover:bg-ink-700 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200"
        >
          <Save className="h-4 w-4" />
          {editingTest ? 'Update Assessment' : 'Publish Assessment'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-paper-200 px-6 py-3 text-sm font-medium text-ink-700 transition-colors duration-150 hover:bg-paper-100 dark:border-ink-700 dark:text-paper-200 dark:hover:bg-ink-dark-bg"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
