import { ChevronDown, Shield } from 'lucide-react'
import { useState } from 'react'
import { QuestionReview } from '../components/QuestionReview'
import { ScoreGauge } from '../components/ScoreGauge'
import { formatDuration, getTotalMarks } from '../lib/scoring'
import type { Submission, Test } from '../types'

interface ResultsViewProps {
  submission: Submission
  test: Test
  isAdmin?: boolean
  onDone: () => void
}

export function ResultsView({ submission, test, isAdmin, onDone }: ResultsViewProps) {
  const [logOpen, setLogOpen] = useState(false)
  const pristine = submission.proctorEvents.length === 0
  const totalMarks = submission.totalMarks ?? getTotalMarks(test.questions)
  const reviewQuestions = submission.correctAnswers
    ? test.questions.map((question, index) => ({
        ...question,
        correctIndex: submission.correctAnswers?.[index] ?? -1,
      }))
    : test.questions

  return (
    <div className="animate-fade-in mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-8 text-center">
        <div className="eyebrow justify-center">Final record</div>
        <h2 className="font-serif mt-2 text-2xl font-medium text-ink-950 dark:text-paper-50">
          Performance report
        </h2>
        <p className="mt-1 text-ink-700 dark:text-paper-200">
          {submission.candidateName} — {submission.testTitle}
        </p>
      </div>

      <div className="mb-8 border border-paper-200 bg-white p-8 dark:border-ink-700 dark:bg-ink-dark-surface">
        <ScoreGauge
          score={submission.score}
          total={submission.totalQuestions}
          totalMarks={totalMarks}
          passMark={test.passMark}
        />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="border border-paper-200 bg-white p-5 dark:border-ink-700 dark:bg-ink-dark-surface">
          <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-300">
            Duration taken
          </p>
          <p className="mt-1 font-mono text-xl font-semibold text-ink-950 dark:text-paper-50">
            {formatDuration(submission.durationSeconds)}
          </p>
        </div>
        <div className="border border-paper-200 bg-white p-5 dark:border-ink-700 dark:bg-ink-dark-surface">
          <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-300">
            Integrity status
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Shield
              className={`h-5 w-5 ${pristine ? 'text-verify-700 dark:text-verify-600' : 'text-brass-700 dark:text-brass-100'}`}
            />
            <p className="font-semibold text-ink-950 dark:text-paper-50">
              {pristine
                ? 'Pristine record'
                : `${submission.proctorEvents.length} flagged event(s)`}
            </p>
          </div>
          {!pristine && (
            <button
              type="button"
              onClick={() => setLogOpen(!logOpen)}
              className="mt-3 flex items-center gap-1 text-sm text-brass-700 transition-colors duration-150 hover:text-brass-600 dark:text-brass-100"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-150 ${logOpen ? 'rotate-180' : ''}`}
              />
              View proctor log
            </button>
          )}
          {logOpen && (
            <div className="animate-fade-in mt-3 space-y-2 border border-paper-200 bg-paper-50 p-3 dark:border-ink-700 dark:bg-ink-dark-bg">
              {submission.proctorEvents.map((ev, i) => (
                <p key={i} className="font-mono text-xs text-brass-700 dark:text-brass-100">
                  {ev.message}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="font-serif mb-4 text-lg font-medium text-ink-950 dark:text-paper-50">
          Verification sheet
        </h3>
        {submission.correctAnswers || isAdmin ? (
          <QuestionReview questions={reviewQuestions} answers={submission.answers} />
        ) : (
          <div className="border border-paper-200 bg-paper-100 p-4 text-sm text-ink-700 dark:border-ink-700 dark:bg-ink-dark-bg dark:text-paper-200">
            Correct answers will be available after the assessment window closes.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onDone}
          className="flex items-center gap-2 rounded-sm bg-ink-950 px-5 py-2.5 text-sm font-medium text-paper-50 transition-colors duration-150 hover:bg-ink-700 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200"
        >
          {isAdmin ? 'Back to dashboard' : 'Done'}
        </button>
      </div>
    </div>
  )
}
