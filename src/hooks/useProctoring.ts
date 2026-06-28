import { useEffect, useRef } from 'react'
import type { ProctorEvent } from '../types'

function formatEventTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function logEvent(onEvent: (e: ProctorEvent) => void, msg: string) {
  const now = new Date()
  onEvent({
    timestamp: now.toISOString(),
    message: `Event Flagged: ${formatEventTime(now)} — ${msg}`,
  })
}

export function useProctoring(
  active: boolean,
  onEvent: (event: ProctorEvent) => void,
  onLockout?: (reason: string) => void
): void {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const onLockoutRef = useRef(onLockout)
  onLockoutRef.current = onLockout

  useEffect(() => {
    if (!active) return

    const fire = (msg: string) => {
      logEvent(onEventRef.current, msg)
    }

    const fireLockout = (reason: string) => {
      fire(reason)
      if (onLockoutRef.current) {
        onLockoutRef.current(reason)
      }
    }

    // CameraProctor owns the stream. Here we only detect devices that disappear,
    // which avoids a second permission prompt and duplicate camera capture.
    let knownVideoInputs = new Set<string>()
    let knownAudioInputs = new Set<string>()
    const snapshotDevices = async (reportChanges: boolean) => {
      if (!navigator.mediaDevices?.enumerateDevices) return
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = new Set(
        devices.filter((device) => device.kind === 'videoinput').map((device) => device.deviceId)
      )
      const audioInputs = new Set(
        devices.filter((device) => device.kind === 'audioinput').map((device) => device.deviceId)
      )

      if (reportChanges && [...knownVideoInputs].some((id) => !videoInputs.has(id))) {
        fire('Camera disconnected during exam')
      }
      if (reportChanges && [...knownAudioInputs].some((id) => !audioInputs.has(id))) {
        fire('Microphone disconnected during exam')
      }
      knownVideoInputs = videoInputs
      knownAudioInputs = audioInputs
    }
    const handleDeviceChange = () => {
      snapshotDevices(true).catch(() => fire('Media device status could not be checked'))
    }
    snapshotDevices(false).catch(() => undefined)
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') fire('Exam tab hidden or switched')
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) fireLockout('Fullscreen mode exited during exam')
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    const handleOffline = () => fire('Network connection lost during exam')
    window.addEventListener('offline', handleOffline)

    const handleCopy = () => fire('Text copy attempted')
    const handleCut = () => fire('Text cut attempted')
    const handlePaste = () => fire('Paste attempted')
    document.addEventListener('copy', handleCopy)
    document.addEventListener('cut', handleCut)
    document.addEventListener('paste', handlePaste)

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      fire('Right-click / context menu attempted')
    }
    document.addEventListener('contextmenu', handleContextMenu)

    const handleBlur = () => {
      fire('Window focus lost (candidate clicked away or opened a screenshot utility)')
    }
    window.addEventListener('blur', handleBlur)

    const handleKeydown = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey
      if (ctrl && event.key.toLowerCase() === 'c') fire('Copy shortcut detected')
      else if (ctrl && event.key.toLowerCase() === 'v') fire('Paste shortcut detected')
      else if (ctrl && event.key === 'Tab') fire('Ctrl+Tab (tab switch shortcut) detected')
      else if (event.key === 'PrintScreen') fire('PrintScreen key pressed / screenshot attempted')
      else if (ctrl && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        fire('Print command (Ctrl+P) shortcut detected')
      }
      else if (event.altKey && event.key === 'Tab') fire('Alt+Tab (window switch shortcut) detected')
    }
    document.addEventListener('keydown', handleKeydown)

    let lastWidth = window.innerWidth
    const handleResize = () => {
      const difference = lastWidth - window.innerWidth
      if (difference > 200) {
        fire(`Window resized significantly (possible DevTools opened: −${difference}px)`)
      }
      lastWidth = window.innerWidth
    }
    window.addEventListener('resize', handleResize)

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('copy', handleCopy)
      document.removeEventListener('cut', handleCut)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('resize', handleResize)
    }
  }, [active])
}
