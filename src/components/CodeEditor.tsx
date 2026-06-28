import Editor, { loader } from '@monaco-editor/react'
import { useState, useEffect } from 'react'
import { Loader2, Play, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '../lib/api'

// Configure Monaco Loader to use jsdelivr CDN
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs'
  }
})

interface TestCase {
  input: string
  expectedOutput: string
  isHidden: boolean
}

interface CodeEditorProps {
  code: string
  language: string
  onChange: (value: string | undefined) => void
  testCases: TestCase[]
  testId?: string
  questionId?: string
}

export function CodeEditor({ code, language, onChange, testCases, testId, questionId }: CodeEditorProps) {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<{ passed: boolean; output: string }[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const [hiddenStats, setHiddenStats] = useState<{ passed: number; total: number; allPassed: boolean } | null>(null)
  const [estimatedMarks, setEstimatedMarks] = useState<{ earned: number; max: number } | null>(null)

  const publicTestCases = testCases.filter((tc) => !tc.isHidden)

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadFailed(true)
    }, 7000)
    return () => clearTimeout(timer)
  }, [])

  const handleRunCode = async () => {
    setRunning(true)
    setResults(null)
    setHiddenStats(null)
    setEstimatedMarks(null)

    if (testId && questionId) {
      try {
        const data = await api.executeCode(language, code, '', testId, questionId)
        if (data.publicResults) {
          setResults(data.publicResults)
        }
        if (data.hiddenStats) {
          setHiddenStats(data.hiddenStats)
        }
        if (data.earnedMarks !== undefined && data.maxMarks !== undefined) {
          setEstimatedMarks({ earned: data.earnedMarks, max: data.maxMarks })
        }
      } catch (err) {
        setResults([{ passed: false, output: err instanceof Error ? err.message : 'Secure test suite execution failed.' }])
      }
      setRunning(false)
      return
    }

    const newResults = []
    for (const tc of publicTestCases) {
      try {
        const out = await api.executeCode(language, code, tc.input)
        const output = out.run
          ? (out.run.stdout || out.run.output || '').trim()
          : (out.message || out.error || 'Execution failed. No runtime response received.').trim()
        const passed = output === tc.expectedOutput.trim()
        newResults.push({ passed, output: output || '<no output>' })
      } catch (err) {
        newResults.push({ passed: false, output: err instanceof Error ? err.message : 'Execution failed or timed out.' })
      }
    }
    
    setResults(newResults)
    setRunning(false)
  }

  return (
    <div className="flex flex-col h-[600px] border border-paper-200 dark:border-ink-700 overflow-hidden bg-white dark:bg-ink-dark-surface">
      <div className="flex-1 min-h-[300px] relative">
        {useFallback ? (
          <textarea
            className="w-full h-full p-4 font-mono text-sm bg-ink-950 text-paper-100 border-none outline-none resize-none focus:ring-0"
            value={code}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Write your solution code here..."
          />
        ) : (
          <Editor
            height="100%"
            language={language}
            theme="vs-dark"
            value={code}
            onChange={onChange}
            onMount={() => setLoadFailed(false)}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              padding: { top: 16 },
              scrollBeyondLastLine: false,
              tabSize: 4,
              insertSpaces: true,
              autoIndent: 'full',
              detectIndentation: true,
            }}
            loading={
              <div className="flex h-full items-center justify-center bg-ink-dark-surface">
                <Loader2 className="h-6 w-6 animate-spin text-brass-600" />
              </div>
            }
          />
        )}

        {loadFailed && !useFallback && (
          <div className="absolute inset-0 bg-ink-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10">
            <p className="text-sm font-semibold text-paper-100">Editor is taking longer than expected to load</p>
            <p className="text-xs text-ink-300 mt-1">This might be due to a slow internet connection or blocked CDN.</p>
            <button
              type="button"
              onClick={() => setUseFallback(true)}
              className="mt-4 bg-paper-50 hover:bg-paper-200 px-4 py-2 text-xs font-semibold text-ink-950 transition-colors"
            >
              Switch to plain text editor
            </button>
          </div>
        )}
      </div>

      {publicTestCases.length > 0 && (
        <div className="border-t border-paper-200 dark:border-ink-700 bg-paper-100 dark:bg-ink-dark-bg p-4 max-h-[250px] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex flex-col">
              <h4 className="text-sm font-semibold text-ink-700 dark:text-paper-200">
                Sample test cases
              </h4>
              {estimatedMarks !== null && estimatedMarks !== undefined && (
                <p className="text-xs text-brass-700 dark:text-brass-100 font-semibold mt-0.5">
                  Estimated marks: {estimatedMarks.earned} / {estimatedMarks.max}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {hiddenStats && (
                <span className={`text-[10px] font-bold px-2.5 py-1 ${hiddenStats.allPassed ? 'bg-verify-100 text-verify-700 dark:bg-verify-100/10 dark:text-verify-600' : 'bg-signal-100 text-signal-700 dark:bg-signal-100/10 dark:text-signal-100'}`}>
                  Hidden cases: {hiddenStats.passed} / {hiddenStats.total} passed
                </span>
              )}
              <button
                onClick={handleRunCode}
                disabled={running}
                className="flex items-center gap-1.5 rounded-sm bg-ink-950 px-3 py-1.5 text-xs font-medium text-paper-50 transition-colors hover:bg-ink-700 disabled:opacity-50 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200"
              >
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {running ? 'Running…' : 'Run code'}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {publicTestCases.map((tc, i) => (
              <div key={i} className="border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-dark-surface p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-ink-500 dark:text-ink-300">Case {i + 1}</span>
                  {results && results[i] && (
                    results[i].passed ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-verify-700 dark:text-verify-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Passed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-signal-700 dark:text-signal-100">
                        <XCircle className="h-3.5 w-3.5" /> Failed
                      </span>
                    )
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <p className="text-[10px] text-ink-300 dark:text-ink-500 uppercase mb-1">Input</p>
                    <pre className="bg-paper-50 dark:bg-ink-dark-bg p-2 overflow-x-auto text-ink-700 dark:text-paper-200">
                      {tc.input}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[10px] text-ink-300 dark:text-ink-500 uppercase mb-1">Expected</p>
                    <pre className="bg-paper-50 dark:bg-ink-dark-bg p-2 overflow-x-auto text-ink-700 dark:text-paper-200">
                      {tc.expectedOutput}
                    </pre>
                  </div>
                </div>
                {results && results[i] && !results[i].passed && (
                  <div className="mt-2 text-xs font-mono">
                    <p className="text-[10px] text-signal-600 dark:text-signal-100 uppercase mb-1">Actual output</p>
                    <pre className="bg-signal-50 dark:bg-signal-100/10 border border-signal-600 dark:border-signal-600 p-2 overflow-x-auto text-signal-700 dark:text-signal-100">
                      {results[i].output}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
