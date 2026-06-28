import type { Question, Answer } from '../types'

export function calculateScore(
  questions: Question[],
  answers: Answer[]
): number {
  return questions.reduce((acc, q, i) => {
    if (q.type === 'coding') return acc // backend calculates coding score
    return answers[i] === q.correctIndex ? acc + (q.marks ?? 1) : acc
  }, 0)
}

export function getTotalMarks(questions: Question[]): number {
  return questions.reduce((acc, q) => acc + (q.marks ?? 1), 0)
}

export function getPassFail(
  score: number,
  totalMarks: number,
  passMark = 50
): 'pass' | 'fail' {
  if (totalMarks === 0) return 'fail'
  return (score / totalMarks) * 100 >= passMark ? 'pass' : 'fail'
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

export function getFeedbackTier(percentage: number): {
  label: string
  message: string
} {
  if (percentage === 100) {
    return {
      label: 'Perfect Score',
      message: 'Outstanding mastery — every response demonstrates precise understanding.',
    }
  }
  if (percentage >= 80) {
    return {
      label: 'Excellent',
      message: 'Strong performance with a thorough grasp of the material.',
    }
  }
  if (percentage >= 70) {
    return {
      label: 'Competent',
      message: 'Solid performance with room to refine edge-case knowledge.',
    }
  }
  if (percentage >= 50) {
    return {
      label: 'Satisfactory',
      message: 'You passed, but reviewing weaker areas will sharpen your skills.',
    }
  }
  return {
    label: 'Review Recommended',
    message: 'Consider revisiting core concepts and retaking the diagnostic.',
  }
}

export function formatTimeRemaining(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
