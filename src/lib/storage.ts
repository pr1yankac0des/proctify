const DARK_MODE_KEY = 'academyflow_dark_mode'

export function loadDarkMode(): boolean {
  return localStorage.getItem(DARK_MODE_KEY) === 'true'
}

export function saveDarkMode(enabled: boolean): void {
  localStorage.setItem(DARK_MODE_KEY, String(enabled))
  // Dispatch storage event so other same-origin tabs can sync
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: DARK_MODE_KEY,
      newValue: String(enabled),
      storageArea: localStorage,
    })
  )
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function getTestShareUrl(testId: string): string {
  return `${window.location.origin}/test/${testId}`
}

/** Copy text to clipboard with fallback for non-HTTPS or older browsers */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
  } else {
    // Fallback: create a temporary textarea
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}
