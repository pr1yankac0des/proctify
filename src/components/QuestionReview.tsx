import { CheckCircle2, ChevronDown, XCircle, Code2 } from 'lucide-react'
import { useState } from 'react'
import type { Question, Answer } from '../types'

const LABELS = ['A', 'B', 'C', 'D'] as const

interface QuestionReviewProps {
  questions: Question[]
  answers: Answer[]
}

export function QuestionReview({ questions, answers }: QuestionReviewProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-2">
      {questions.map((q, idx) => {
        const selected = answers[idx]
        // We only show simple visual check for MCQ here, coding evaluation needs backend scores
        const isCorrect = q.type === 'coding' ? false : selected === q.correctIndex
        const isOpen = expanded[q.id] ?? false

        return (
          <div
            key={q.id}
            className="overflow-hidden border border-paper-200 bg-white dark:border-ink-700 dark:bg-ink-dark-surface"
          >
            <button
              type="button"
              onClick={() => toggle(q.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-paper-100 dark:hover:bg-ink-dark-bg"
            >
              {q.type === 'coding' ? (
                <Code2 className="h-5 w-5 shrink-0 text-ink-300 dark:text-ink-500" />
              ) : isCorrect ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-verify-700 dark:text-verify-600" />
              ) : (
                <XCircle className="h-5 w-5 shrink-0 text-signal-600 dark:text-signal-100" />
              )}
              <span className="flex-1 text-sm font-medium text-ink-950 dark:text-paper-50 whitespace-pre-wrap">
                Q{idx + 1}. {q.text}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-ink-300 transition-transform duration-150 dark:text-ink-500 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div className="animate-fade-in border-t border-paper-200 px-4 py-3 dark:border-ink-700">
                {q.type === 'coding' ? (
                   <div className="space-y-2">
                     <p className="text-sm font-medium text-ink-700 dark:text-paper-200">Your submitted code:</p>
                     <pre className="border border-paper-200 bg-paper-50 p-3 text-xs font-mono text-ink-950 overflow-x-auto dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-200">
                       {typeof selected === 'object' && selected !== null ? selected.code : 'No code submitted.'}
                     </pre>
                   </div>
                ) : (
                  <div className="space-y-2">
                    {(q.options || []).map((opt, oi) => {
                      const isSelected = selected === oi
                      const isAnswer = q.correctIndex === oi
                      let cls =
                        'border px-3 py-2 text-sm border-paper-200 text-ink-700 dark:border-ink-700 dark:text-paper-200'
                      if (isAnswer) {
                        cls =
                          'border px-3 py-2 text-sm border-verify-700 bg-verify-50 text-verify-700 dark:border-verify-600 dark:bg-verify-100/10 dark:text-verify-600'
                      } else if (isSelected && !isCorrect) {
                        cls =
                          'border px-3 py-2 text-sm border-signal-600 bg-signal-50 text-signal-700 dark:border-signal-600 dark:bg-signal-100/10 dark:text-signal-100'
                      }
                      return (
                        <div key={oi} className={cls}>
                          <span className="font-mono font-semibold">{LABELS[oi]}.</span> {opt}
                          {isAnswer && (
                            <span className="ml-2 text-xs font-medium text-verify-700 dark:text-verify-600">
                              (Correct)
                            </span>
                          )}
                          {isSelected && !isAnswer && (
                            <span className="ml-2 text-xs font-medium text-signal-700 dark:text-signal-100">(Your choice)</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
