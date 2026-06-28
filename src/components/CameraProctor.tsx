import { useEffect, useRef, useState } from 'react'
import { Camera, Mic, AlertTriangle } from 'lucide-react'

interface CameraProctorProps {
  active: boolean
  onVideoRef?: (ref: React.RefObject<HTMLVideoElement | null>) => void
  onMediaEvent?: (message: string) => void
}

export function CameraProctor({ active, onVideoRef, onMediaEvent }: CameraProctorProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [micActive, setMicActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [micError, setMicError] = useState<string | null>(null)

  useEffect(() => {
    if (onVideoRef) {
      onVideoRef(videoRef)
    }
  }, [onVideoRef])

  useEffect(() => {
    if (!active) {
      setCameraActive(false)
      setMicActive(false)
      return
    }

    let disposed = false
    let stream: MediaStream | null = null

    ;(async () => {
      try {
        setCameraError(null)
        setMicError(null)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true,
        })

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.play().catch((err) => console.error('Play error:', err))
        }

        // Check if camera and mic are in the stream
        const videoTracks = stream.getVideoTracks()
        const audioTracks = stream.getAudioTracks()

        for (const track of videoTracks) {
          track.addEventListener('ended', () => {
            setCameraActive(false)
            setCameraError('Camera stream stopped during the exam')
            onMediaEvent?.('Camera stream stopped during exam')
          }, { once: true })
        }
        for (const track of audioTracks) {
          track.addEventListener('ended', () => {
            setMicActive(false)
            setMicError('Microphone stream stopped during the exam')
            onMediaEvent?.('Microphone stream stopped during exam')
          }, { once: true })
        }

        setCameraActive(videoTracks.length > 0)
        setMicActive(audioTracks.length > 0)

        if (videoTracks.length === 0) {
          setCameraError('Camera not available')
        }
        if (audioTracks.length === 0) {
          setMicError('Microphone not available')
        }
      } catch (err) {
        const errMsg = (err as Error).message || String(err)
        setCameraError(errMsg)
        setMicError(errMsg)
      }
    })()

    return () => {
      disposed = true
      stream?.getTracks().forEach((track) => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [active, onMediaEvent])

  if (!active) return null

  return (
    <div className="space-y-3">
      {/* Video Preview */}
      <div className="relative overflow-hidden border-2 border-ink-950 bg-black dark:border-paper-50">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-40 w-full object-cover"
        />
        <div className="absolute bottom-2 left-2 flex flex-col gap-1">
          <div
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium ${
              cameraActive
                ? 'bg-verify-700/90 text-paper-50'
                : 'bg-signal-700/90 text-paper-50'
            }`}
          >
            <Camera className="h-3 w-3" />
            {cameraActive ? 'Camera active' : 'Camera off'}
          </div>
          <div
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium ${
              micActive ? 'bg-verify-700/90 text-paper-50' : 'bg-signal-700/90 text-paper-50'
            }`}
          >
            <Mic className="h-3 w-3" />
            {micActive ? 'Mic active' : 'Mic off'}
          </div>
        </div>
      </div>

      {/* Error Alerts */}
      {(cameraError || micError) && (
        <div className="space-y-2">
          {cameraError && (
            <div className="flex items-start gap-2 border border-signal-700 bg-signal-50 p-3 dark:border-signal-600 dark:bg-signal-100/10">
              <AlertTriangle className="h-4 w-4 shrink-0 text-signal-700 dark:text-signal-100" />
              <div className="text-sm text-signal-700 dark:text-signal-100">
                <p className="font-semibold">Camera issue</p>
                <p className="text-xs">{cameraError}</p>
              </div>
            </div>
          )}
          {micError && (
            <div className="flex items-start gap-2 border border-signal-700 bg-signal-50 p-3 dark:border-signal-600 dark:bg-signal-100/10">
              <AlertTriangle className="h-4 w-4 shrink-0 text-signal-700 dark:text-signal-100" />
              <div className="text-sm text-signal-700 dark:text-signal-100">
                <p className="font-semibold">Microphone issue</p>
                <p className="text-xs">{micError}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
