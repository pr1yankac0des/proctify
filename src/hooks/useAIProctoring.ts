import { useEffect, useRef } from 'react'
import { getFaceDetector, getObjectDetector } from '../lib/visionTasks'
import type { ProctorEvent } from '../types'

export type GazeDirection = 'center' | 'left' | 'right' | 'up' | 'unknown'

export interface AIProctorStatus {
  facesDetected: number
  facePresence: boolean
  attentionFocused: boolean
  multiplePeople: boolean
  suspicious: string[]
  confidence: number
  modelReady: boolean
  modelError: string | null
  // Gaze tracking
  lookingAway: boolean
  gazeDirection: GazeDirection
  // Device tracking
  deviceDetected: boolean
}

function logEvent(onEvent: (event: ProctorEvent) => void, message: string) {
  onEvent({
    timestamp: new Date().toISOString(),
    message: `ML Proctor: ${message}`,
  })
}

function estimateGaze(
  keypoints: Array<{ x: number; y: number }> | undefined
): { direction: GazeDirection; yawAsymmetry: number; pitchRatio: number } {
  const unknown = { direction: 'unknown' as GazeDirection, yawAsymmetry: 0.5, pitchRatio: 0.5 }
  if (!keypoints || keypoints.length < 4) return unknown

  const rightEye = keypoints[0]
  const leftEye  = keypoints[1]
  const nose     = keypoints[2]
  const mouth    = keypoints[3]

  const leftSpan  = nose.x - rightEye.x
  const rightSpan = leftEye.x - nose.x
  const totalSpan = leftSpan + rightSpan

  if (totalSpan < 0.01) return unknown

  const yawAsymmetry = leftSpan / totalSpan

  const eyeMidY = (rightEye.y + leftEye.y) / 2
  const vertSpan = mouth.y - eyeMidY
  const pitchRatio = vertSpan > 0.01 ? (nose.y - eyeMidY) / vertSpan : 0.5

  let direction: GazeDirection = 'center'

  if (yawAsymmetry < 0.30) {
    direction = 'left'
  } else if (yawAsymmetry > 0.70) {
    direction = 'right'
  }

  return { direction, yawAsymmetry, pitchRatio }
}

export function useAIProctoring(
  videoElementRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  onEvent: (event: ProctorEvent) => void,
  onStatusUpdate: (status: AIProctorStatus) => void
): void {
  const onEventRef = useRef(onEvent)
  const onStatusRef = useRef(onStatusUpdate)
  onEventRef.current = onEvent
  onStatusRef.current = onStatusUpdate

  useEffect(() => {
    if (!active) return

    let disposed = false
    let animationFrame: number | null = null
    let lastAnalysisTime = 0
    const conditionStartedAt: Record<string, number> = {}
    const lastLoggedAt: Record<string, number> = {}
    
    // Config
    const ANALYSIS_INTERVAL_MS = 750
    const CONDITION_GRACE_MS   = 1500
    const EVENT_COOLDOWN_MS    = 10_000

    const initialStatus: AIProctorStatus = {
      facesDetected: 0,
      facePresence: false,
      attentionFocused: false,
      multiplePeople: false,
      suspicious: [],
      confidence: 0,
      modelReady: false,
      modelError: null,
      lookingAway: false,
      gazeDirection: 'unknown',
      deviceDetected: false,
    }
    onStatusRef.current(initialStatus)

    const recordSustainedCondition = (
      key: string,
      activeCondition: boolean,
      message: string,
      now: number,
      graceMs = CONDITION_GRACE_MS
    ) => {
      if (!activeCondition) {
        delete conditionStartedAt[key]
        return
      }
      conditionStartedAt[key] ??= now
      const sustained  = now - conditionStartedAt[key] >= graceMs
      const cooledDown = now - (lastLoggedAt[key] ?? 0) >= EVENT_COOLDOWN_MS
      if (sustained && cooledDown) {
        logEvent(onEventRef.current, message)
        lastLoggedAt[key] = now
      }
    }

    Promise.all([getFaceDetector(), getObjectDetector()])
      .then(([faceDetector, objectDetector]) => {
        if (disposed) return

        const analyzeFrame = (frameTime: number) => {
          if (disposed) return
          const video = videoElementRef.current
          if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            animationFrame = requestAnimationFrame(analyzeFrame)
            return
          }

          if (frameTime - lastAnalysisTime < ANALYSIS_INTERVAL_MS) {
            animationFrame = requestAnimationFrame(analyzeFrame)
            return
          }
          lastAnalysisTime = frameTime

          try {
            const now = performance.now()
            const faceDetections = faceDetector.detectForVideo(video, now).detections
            const objDetections  = objectDetector.detectForVideo(video, now).detections

            // ── Face Analysis ─────────────────────────────────────────────
            const facesDetected = faceDetections.length
            const facePresence  = facesDetected > 0
            const multiplePeople = facesDetected > 1
            const primaryFace   = faceDetections[0]
            const box           = primaryFace?.boundingBox

            const centerX = box ? (box.originX + box.width  / 2) / video.videoWidth  : 0
            const centerY = box ? (box.originY + box.height / 2) / video.videoHeight : 0
            const faceArea = box ? (box.width * box.height) / (video.videoWidth * video.videoHeight) : 0
            
            const attentionFocused =
              facePresence && !multiplePeople &&
              centerX >= 0.1 && centerX <= 0.9 &&
              centerY >= 0.05 && centerY <= 0.95 &&
              faceArea >= 0.01

            const { direction } = estimateGaze(primaryFace?.keypoints as Array<{ x: number; y: number }> | undefined)
            const lookingAway = facePresence && !multiplePeople && direction !== 'center' && direction !== 'unknown'

            const confidence = Math.round(
              Math.max(0, ...faceDetections.map((d) => d.categories[0]?.score ?? 0)) * 100
            )

            // ── Object Analysis ───────────────────────────────────────────
            const phones = objDetections.filter(d => d.categories[0]?.categoryName === 'cell phone')
            const deviceDetected = phones.length > 0

            // ── Suspicious flags ──────────────────────────────────────────
            const suspicious: string[] = []
            if (!facePresence) suspicious.push('Face not detected')
            if (multiplePeople) suspicious.push('Multiple people detected')
            if (facePresence && !multiplePeople && !attentionFocused) suspicious.push('Face outside focus area')
            if (lookingAway) {
              const label =
                direction === 'left'  ? 'Looking LEFT (away from screen)' :
                direction === 'right' ? 'Looking RIGHT (away from screen)' :
                                        'Looking away from screen'
              suspicious.push(label)
            }
            if (deviceDetected) suspicious.push('Unauthorised device (phone) detected')

            // ── Sustained-condition events ────────────────────────────────
            const realNow = Date.now()
            recordSustainedCondition('noFace', !facePresence, 'Face absent for more than 1.5 seconds', realNow)
            recordSustainedCondition('multiplePeople', multiplePeople, 'Multiple people detected', realNow)
            recordSustainedCondition('outsideFocus', facePresence && !multiplePeople && !attentionFocused, 'Candidate moved outside the camera focus area', realNow)
            recordSustainedCondition('lookingAway', lookingAway, `Candidate looked away from the screen (gaze: ${direction})`, realNow)
            recordSustainedCondition('deviceDetected', deviceDetected, 'Unauthorised device (phone) detected in view', realNow)

            onStatusRef.current({
              facesDetected,
              facePresence,
              attentionFocused,
              multiplePeople,
              suspicious,
              confidence,
              modelReady: true,
              modelError: null,
              lookingAway,
              gazeDirection: facePresence ? direction : 'unknown',
              deviceDetected,
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Analysis failed'
            onStatusRef.current({ ...initialStatus, modelReady: true, modelError: message })
          }
          animationFrame = requestAnimationFrame(analyzeFrame)
        }

        animationFrame = requestAnimationFrame(analyzeFrame)
      })
      .catch((error) => {
        if (disposed) return
        const message = error instanceof Error ? error.message : 'ML models could not be loaded'
        onStatusRef.current({ ...initialStatus, modelError: message })
        logEvent(onEventRef.current, `Model unavailable: ${message}`)
      })

    return () => {
      disposed = true
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
    }
  }, [active, videoElementRef])
}
