import { useEffect, useRef } from 'react'
import type { ProctorEvent } from '../types'

export interface AudioProctorStatus {
  audioReady: boolean
  audioError: string | null
  audioLevel: number // 0–100, smoothed RMS volume
  speakingAloud: boolean // sustained loud audio
  transcriptionSupported: boolean
  transcriptionActive: boolean
  lastTranscript: string | null
}

function logEvent(onEvent: (event: ProctorEvent) => void, message: string) {
  onEvent({
    timestamp: new Date().toISOString(),
    message: `Audio Proctor: ${message}`,
  })
}

// Minimal shape for the non-standard Web Speech API across browsers.
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: Event & { error?: string }) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Local volume monitoring (AnalyserNode, fully on-device) plus optional speech
 * transcription via the browser's Web Speech API.
 *
 * IMPORTANT PRIVACY NOTE: volume/VAD analysis never leaves the device. Speech
 * transcription, where supported (Chromium-based browsers only), sends short
 * audio clips to the browser vendor's speech recognition service to produce
 * text — this is the one part of Proctify's proctoring that is NOT fully
 * on-device. Only the resulting transcript text is logged, never raw audio.
 * This must be disclosed to candidates before they consent (see ExamPreflight).
 */
export function useAudioProctoring(
  videoElementRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  enableTranscription: boolean,
  onEvent: (event: ProctorEvent) => void,
  onStatusUpdate: (status: AudioProctorStatus) => void
): void {
  const onEventRef = useRef(onEvent)
  const onStatusRef = useRef(onStatusUpdate)
  onEventRef.current = onEvent
  onStatusRef.current = onStatusUpdate

  useEffect(() => {
    if (!active) return

    let disposed = false
    let audioContext: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let rafId: number | null = null
    let recognition: SpeechRecognitionLike | null = null
    let recognitionRestartTimeout: number | null = null

    const conditionStartedAt: Record<string, number> = {}
    const lastLoggedAt: Record<string, number> = {}

    // Config — mirrors the cadence used by useAIProctoring for consistency.
    const LOUD_THRESHOLD = 35 // 0–100 scale; sustained speech/noise above this
    const CONDITION_GRACE_MS = 1500
    const EVENT_COOLDOWN_MS = 10_000

    const recordSustainedCondition = (
      key: string,
      conditionActive: boolean,
      message: string,
      now: number
    ) => {
      if (!conditionActive) {
        delete conditionStartedAt[key]
        return
      }
      conditionStartedAt[key] ??= now
      const sustained = now - conditionStartedAt[key] >= CONDITION_GRACE_MS
      const cooledDown = now - (lastLoggedAt[key] ?? 0) >= EVENT_COOLDOWN_MS
      if (sustained && cooledDown) {
        logEvent(onEventRef.current, message)
        lastLoggedAt[key] = now
      }
    }

    const status: AudioProctorStatus = {
      audioReady: false,
      audioError: null,
      audioLevel: 0,
      speakingAloud: false,
      transcriptionSupported: Boolean(getSpeechRecognitionCtor()),
      transcriptionActive: false,
      lastTranscript: null,
    }
    onStatusRef.current({ ...status })

    const waitForStream = async (): Promise<MediaStream | null> => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (disposed) return null
        const srcObject = videoElementRef.current?.srcObject
        if (srcObject instanceof MediaStream && srcObject.getAudioTracks().length > 0) {
          return srcObject
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250))
      }
      return null
    }

    ;(async () => {
      const stream = await waitForStream()
      if (disposed) return
      if (!stream) {
        status.audioError = 'No microphone track available for audio monitoring'
        onStatusRef.current({ ...status })
        return
      }

      try {
        // ── Local volume monitoring (AnalyserNode) — never leaves the device ──
        audioContext = new AudioContext()
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 1024
        analyser.smoothingTimeConstant = 0.8
        source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        const buffer = new Uint8Array(analyser.frequencyBinCount)

        const tick = () => {
          if (disposed || !analyser) return
          analyser.getByteTimeDomainData(buffer)
          let sumSquares = 0
          for (let i = 0; i < buffer.length; i += 1) {
            const normalized = (buffer[i] - 128) / 128
            sumSquares += normalized * normalized
          }
          const rms = Math.sqrt(sumSquares / buffer.length)
          const level = Math.min(100, Math.round(rms * 100 * 4)) // scaled for readable range

          const now = Date.now()
          const speakingAloud = level >= LOUD_THRESHOLD
          recordSustainedCondition(
            'loudAudio',
            speakingAloud,
            `Sustained loud audio detected (level ${level}/100) — possible talking or background noise`,
            now
          )

          status.audioReady = true
          status.audioError = null
          status.audioLevel = level
          status.speakingAloud = speakingAloud
          onStatusRef.current({ ...status })

          rafId = requestAnimationFrame(tick)
        }
        rafId = requestAnimationFrame(tick)
      } catch (error) {
        status.audioError = error instanceof Error ? error.message : 'Audio analysis failed to start'
        onStatusRef.current({ ...status })
      }

      // ── Optional speech transcription (Web Speech API) ──────────────────
      // Disclosed exception to the "fully on-device" design: Chromium browsers
      // stream short audio clips to the vendor's speech service for this
      // feature. Only the resulting text is ever logged here.
      const SpeechRecognitionCtor = getSpeechRecognitionCtor()
      if (enableTranscription && SpeechRecognitionCtor) {
        const startRecognition = () => {
          if (disposed) return
          try {
            recognition = new SpeechRecognitionCtor()
            recognition.continuous = true
            recognition.interimResults = false
            recognition.lang = 'en-US'

            recognition.onresult = (event) => {
              if (disposed) return
              for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const result = event.results[i]
                if (!result?.isFinal) continue
                const transcript = result[0]?.transcript?.trim()
                if (!transcript) continue
                status.lastTranscript = transcript
                onStatusRef.current({ ...status })
                logEvent(onEventRef.current, `Speech detected: "${transcript}"`)
              }
            }

            recognition.onerror = (event) => {
              const err = (event as Event & { error?: string }).error
              // 'no-speech' fires constantly in silence; not a real error.
              if (err && err !== 'no-speech' && err !== 'aborted') {
                status.audioError = `Transcription error: ${err}`
                onStatusRef.current({ ...status })
              }
            }

            recognition.onend = () => {
              status.transcriptionActive = false
              onStatusRef.current({ ...status })
              // Browsers auto-stop recognition periodically; restart while active.
              if (!disposed) {
                recognitionRestartTimeout = window.setTimeout(startRecognition, 500)
              }
            }

            recognition.start()
            status.transcriptionActive = true
            onStatusRef.current({ ...status })
          } catch {
            status.transcriptionActive = false
            onStatusRef.current({ ...status })
          }
        }
        startRecognition()
      }
    })()

    return () => {
      disposed = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (recognitionRestartTimeout !== null) window.clearTimeout(recognitionRestartTimeout)
      if (recognition) {
        recognition.onend = null
        recognition.onerror = null
        recognition.onresult = null
        try {
          recognition.stop()
        } catch {
          // ignore
        }
      }
      source?.disconnect()
      analyser?.disconnect()
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => undefined)
      }
    }
  }, [active, enableTranscription, videoElementRef])
}
