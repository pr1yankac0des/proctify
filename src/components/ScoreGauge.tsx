import { CheckCircle2, XCircle } from 'lucide-react'
import { getFeedbackTier, getPassFail } from '../lib/scoring'

interface ScoreGaugeProps {
  score: number
  total: number
  totalMarks?: number
  passMark?: number
}

export function ScoreGauge({ score, total, totalMarks, passMark }: ScoreGaugeProps) {
  const marksDenominator = totalMarks ?? total
  const percentage = marksDenominator > 0 ? Math.round((score / marksDenominator) * 100) : 0
  const { label, message } = getFeedbackTier(percentage)
  const circumference = 2 * Math.PI * 54
  const offset = circumference - (percentage / 100) * circumference

  const passResult = passMark !== undefined ? getPassFail(score, marksDenominator, passMark) : null

  const gaugeColor =
    percentage >= (passMark ?? 50)
      ? 'text-verify-700 dark:text-verify-600'
      : percentage >= 40
        ? 'text-brass-600 dark:text-brass-100'
        : 'text-signal-700 dark:text-signal-100'

  return (
    <div className="flex flex-col items-center gap-4 animate-fade-in">
      <div className="relative">
        <svg width="140" height="140" className="-rotate-90">
          <circle
            cx="70"
            cy="70"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="text-paper-200 dark:text-ink-700"
          />
          <circle
            cx="70"
            cy="70"
            r="54"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="butt"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`${gaugeColor} transition-all duration-700`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-serif text-3xl font-medium text-ink-950 dark:text-paper-50">
            {percentage}%
          </span>
          <span className="text-xs text-ink-500 dark:text-ink-300">
            {score}/{marksDenominator} marks
          </span>
        </div>
      </div>

      {/* Pass / Fail mark */}
      {passResult && (
        <div
          className={`flex items-center gap-2 border px-5 py-2 text-sm font-bold ${
            passResult === 'pass'
              ? 'border-verify-700 bg-verify-50 text-verify-700 dark:border-verify-600 dark:bg-verify-100/10 dark:text-verify-600'
              : 'border-signal-700 bg-signal-50 text-signal-700 dark:border-signal-600 dark:bg-signal-100/10 dark:text-signal-100'
          }`}
        >
          {passResult === 'pass' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {passResult === 'pass' ? 'PASS' : 'FAIL'}
          {passMark !== undefined && (
            <span className="ml-1 font-normal opacity-70">(threshold {passMark}%)</span>
          )}
        </div>
      )}

      <div className="text-center">
        <p className="font-serif text-lg font-medium text-brass-700 dark:text-brass-100">{label}</p>
        <p className="mt-1 max-w-sm text-sm text-ink-700 dark:text-paper-200">{message}</p>
      </div>
    </div>
  )
}
