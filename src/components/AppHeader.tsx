import { ThemeToggle } from './ThemeToggle'

interface AppHeaderProps {
  darkMode: boolean
  onToggleDark: () => void
  label: string
  examActive?: boolean
}

export function AppHeader({ darkMode, onToggleDark, label, examActive }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-paper-200 bg-paper-50/95 dark:border-ink-700 dark:bg-ink-dark-bg/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="seal h-9 w-9 text-ink-950 dark:text-paper-50">
            <span className="font-serif text-sm">P</span>
          </div>
          <div>
            <h1 className="font-serif text-lg font-medium tracking-tight text-ink-950 dark:text-paper-50">
              Proctify
            </h1>
            <p className="text-xs text-ink-500 dark:text-ink-300">
              Privacy-first exam integrity
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`hidden px-3 py-1 font-mono text-xs sm:inline-block ${
              examActive
                ? 'bg-brass-50 text-brass-700 dark:bg-brass-100/10 dark:text-brass-100'
                : 'bg-paper-100 text-ink-700 dark:bg-ink-dark-surface dark:text-paper-200'
            }`}
          >
            {examActive ? '● EXAM LOCKED' : label}
          </span>
          <ThemeToggle darkMode={darkMode} onToggle={onToggleDark} />
        </div>
      </div>
    </header>
  )
}
