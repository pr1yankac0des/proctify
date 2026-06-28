import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Expand,
  Loader2,
  Mic,
  RefreshCw,
  ScanFace,
  Server,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { getFaceDetector } from '../lib/visionTasks'

type CheckState = 'pending' | 'running' | 'passed' | 'failed'

interface ReadinessCheck {
  id: string
  label: string
  detail: string
  state: CheckState
}

interface ExamPreflightProps {
  apiBaseUrl: string
  voiceTranscriptionEnabled?: boolean
  onEnter: () => void | Promise<void>
}

const INITIAL_CHECKS: ReadinessCheck[] = [
  { id: 'secure', label: 'Secure browser context', detail: 'Required for protected media access', state: 'pending' },
  { id: 'api', label: 'Exam server connection', detail: 'The API must be reachable', state: 'pending' },
  { id: 'camera', label: 'Camera permission', detail: 'A live video track is required', state: 'pending' },
  { id: 'microphone', label: 'Microphone permission', detail: 'A live audio track is required', state: 'pending' },
  { id: 'model', label: 'ML proctor model', detail: 'MediaPipe face model must load locally', state: 'pending' },
  { id: 'face', label: 'Face visibility', detail: 'Exactly one face must be clearly visible', state: 'pending' },
  { id: 'fullscreen', label: 'Fullscreen support', detail: 'The exam opens in fullscreen mode', state: 'pending' },
]

function friendlyMediaError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') return 'Permission was denied. Allow camera and microphone in browser settings, then retry.'
  if (name === 'NotFoundError') return 'No usable camera or microphone was found.'
  if (name === 'NotReadableError') return 'The camera or microphone is busy in another application.'
  if (name === 'OverconstrainedError') return 'The connected media device cannot meet the required settings.'
  return error instanceof Error ? error.message : 'Media devices could not be opened.'
}

export function ExamPreflight({ apiBaseUrl, voiceTranscriptionEnabled = false, onEnter }: ExamPreflightProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [checks, setChecks] = useState(INITIAL_CHECKS)
  const [running, setRunning] = useState(false)
  const [entering, setEntering] = useState(false)
  const [consented, setConsented] = useState(false)
  const [error, setError] = useState('')

  const updateCheck = (id: string, state: CheckState, detail?: string) => {
    setChecks((current) =>
      current.map((check) => check.id === id ? { ...check, state, detail: detail ?? check.detail } : check)
    )
  }

  const stopPreview = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  useEffect(() => stopPreview, [])

  const runChecks = async () => {
    stopPreview()
    setChecks(INITIAL_CHECKS)
    setError('')
    setRunning(true)

    try {
      const secure = window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia)
      updateCheck('secure', secure ? 'passed' : 'failed', secure
        ? 'Secure media APIs are available'
        : 'Use HTTPS or localhost in a supported browser')

      updateCheck('fullscreen', document.fullscreenEnabled ? 'passed' : 'failed', document.fullscreenEnabled
        ? 'Fullscreen mode is supported'
        : 'This browser does not permit fullscreen mode')

      updateCheck('api', 'running', 'Checking server health…')
      const health = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/health`, { headers: { Accept: 'application/json' } })
      if (!health.ok) throw new Error(`Exam server returned ${health.status}`)
      updateCheck('api', 'passed', 'Exam server is online')

      if (!secure) throw new Error('Secure camera and microphone APIs are unavailable.')

      updateCheck('camera', 'running', 'Waiting for browser permission…')
      updateCheck('microphone', 'running', 'Waiting for browser permission…')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]
      const cameraReady = videoTrack?.readyState === 'live'
      const microphoneReady = audioTrack?.readyState === 'live'
      updateCheck('camera', cameraReady ? 'passed' : 'failed', cameraReady
        ? `Ready: ${videoTrack.label || 'camera'}`
        : 'No live camera track was returned')
      updateCheck('microphone', microphoneReady ? 'passed' : 'failed', microphoneReady
        ? `Ready: ${audioTrack.label || 'microphone'}`
        : 'No live microphone track was returned')
      if (!cameraReady || !microphoneReady) throw new Error('Both camera and microphone must be active.')

      const video = videoRef.current
      if (!video) throw new Error('Camera preview could not be created.')
      video.srcObject = stream
      await video.play()

      updateCheck('model', 'running', 'Loading the MediaPipe face detector…')
      const detector = await getFaceDetector()
      updateCheck('model', 'passed', 'MediaPipe BlazeFace model loaded')

      updateCheck('face', 'running', 'Looking for exactly one face…')
      let detectedFaces = 0
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          detectedFaces = detector.detectForVideo(video, performance.now()).detections.length
          if (detectedFaces === 1) break
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250))
      }
      updateCheck('face', detectedFaces === 1 ? 'passed' : 'failed', detectedFaces === 0
        ? 'No face found. Face the camera in good lighting and retry.'
        : detectedFaces === 1 ? 'One face detected and ready' : `${detectedFaces} faces detected; only the candidate may be visible`)
      if (detectedFaces !== 1) throw new Error('The face visibility check did not pass.')
    } catch (caught) {
      const message = friendlyMediaError(caught)
      setError(message)
      setChecks((current) => current.map((check) =>
        check.state === 'running' ? { ...check, state: 'failed', detail: message } : check
      ))
    } finally {
      setRunning(false)
    }
  }

  const allPassed = useMemo(() => checks.every((check) => check.state === 'passed'), [checks])

  const enterExam = async () => {
    if (!allPassed || !consented || document.visibilityState !== 'visible') {
      setError('Keep this tab visible and complete every check before entering.')
      return
    }
    setEntering(true)
    try {
      await document.documentElement.requestFullscreen()
      stopPreview()
      await onEnter()
    } catch (caught) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
      setError(caught instanceof Error ? caught.message : 'The exam could not be started. Please retry.')
    } finally {
      setEntering(false)
    }
  }

  const iconFor = (check: ReadinessCheck) => {
    if (check.state === 'running') return <Loader2 className="h-5 w-5 animate-spin text-brass-600" />
    if (check.state === 'passed') return <CheckCircle2 className="h-5 w-5 text-verify-700 dark:text-verify-600" />
    if (check.state === 'failed') return <XCircle className="h-5 w-5 text-signal-700 dark:text-signal-100" />
    const icons: Record<string, ReactNode> = {
      secure: <ShieldCheck className="h-5 w-5" />, api: <Server className="h-5 w-5" />,
      camera: <Camera className="h-5 w-5" />, microphone: <Mic className="h-5 w-5" />,
      model: <ScanFace className="h-5 w-5" />, face: <ScanFace className="h-5 w-5" />,
      fullscreen: <Expand className="h-5 w-5" />,
    }
    return <span className="text-ink-300 dark:text-ink-500">{icons[check.id]}</span>
  }

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_16rem]">
      <div className="space-y-3">
        <p className="text-sm text-ink-700 dark:text-paper-200">
          Nothing starts until every required browser, device, server, and ML check passes.
        </p>
        <div className="space-y-2" aria-live="polite">
          {checks.map((check) => (
            <div key={check.id} className="flex items-start gap-3 border border-paper-200 p-3 dark:border-ink-700">
              {iconFor(check)}
              <div>
                <p className="text-sm font-semibold text-ink-950 dark:text-paper-50">{check.label}</p>
                <p className="text-xs text-ink-500 dark:text-ink-300">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="aspect-[4/3] overflow-hidden border-2 border-paper-200 bg-ink-950 dark:border-ink-700">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        </div>
        <p className="text-center text-xs text-ink-500 dark:text-ink-300">Live preview stays on this device.</p>
        {error && (
          <div className="flex gap-2 border border-signal-600 bg-signal-50 p-3 text-xs text-signal-700 dark:border-signal-600 dark:bg-signal-100/10 dark:text-signal-100">
            <AlertTriangle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
        <label className="flex cursor-pointer items-start gap-2 border border-paper-200 p-3 text-xs text-ink-700 dark:border-ink-700 dark:text-paper-200">
          <input
            type="checkbox"
            checked={consented}
            onChange={(event) => setConsented(event.target.checked)}
            className="mt-0.5 h-4 w-4 border-paper-200 text-ink-950 focus:ring-ink-950 dark:border-ink-700"
          />
          <span>
            I understand that device status and proctor events are stored with my attempt. Camera analysis and audio-level monitoring run locally; Proctify does not record or upload video frames.
            {voiceTranscriptionEnabled && (
              <> <strong>This test also enables speech transcription:</strong> short audio clips are sent to your browser's speech recognition service (Chromium browsers only) to detect and log spoken words — this is the one part of monitoring that is not fully on-device.</>
            )}
          </span>
        </label>
        <button type="button" onClick={runChecks} disabled={running}
          className="flex w-full items-center justify-center gap-2 border border-ink-950 px-4 py-2.5 text-sm font-semibold text-ink-950 hover:bg-paper-100 disabled:opacity-50 dark:border-paper-200 dark:text-paper-50 dark:hover:bg-ink-dark-bg">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {running ? 'Checking…' : 'Run system check'}
        </button>
        <button type="button" onClick={enterExam} disabled={!allPassed || !consented || running || entering}
          className="w-full rounded-sm bg-ink-950 py-3 font-semibold text-paper-50 hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-paper-50 dark:text-ink-950 dark:hover:bg-paper-200">
          {entering ? 'Starting assessment…' : 'Enter assessment in fullscreen'}
        </button>
      </div>
    </div>
  )
}
