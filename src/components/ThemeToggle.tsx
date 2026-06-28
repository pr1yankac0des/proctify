import { Moon, Sun } from 'lucide-react'

interface ThemeToggleProps {
  darkMode: boolean
  onToggle: () => void
}

export function ThemeToggle({ darkMode, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex items-center gap-2 border border-paper-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 transition-colors duration-150 hover:bg-paper-100 dark:border-ink-700 dark:bg-ink-dark-surface dark:text-paper-200 dark:hover:bg-ink-dark-bg"
    >
      {darkMode ? <Sun className="h-4 w-4 text-brass-600" /> : <Moon className="h-4 w-4 text-ink-700" />}
      <span>{darkMode ? 'Light' : 'Dark'}</span>
    </button>
  )
}
