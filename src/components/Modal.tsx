import { X } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}

export function Modal({ open, onClose, title, children, wide }: ModalProps) {
  const titleId = useId()
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-0 bg-ink-950/60 dark:bg-black/70"
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`animate-fade-in relative z-10 max-h-[90vh] w-full overflow-y-auto border border-paper-200 bg-white p-6 dark:border-ink-700 dark:bg-ink-dark-surface ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="mb-4 flex items-center justify-between border-b border-paper-200 pb-4 dark:border-ink-700">
          <h2 id={titleId} className="font-serif text-xl font-medium text-ink-950 dark:text-paper-50">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 text-ink-300 transition-colors duration-150 hover:bg-paper-100 hover:text-ink-700 dark:hover:bg-ink-dark-bg dark:hover:text-paper-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
