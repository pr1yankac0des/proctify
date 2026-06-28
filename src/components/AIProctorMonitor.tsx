import { useState } from 'react'
import { AlertTriangle, CheckCircle, Eye, EyeOff, Users, Zap, Smartphone, Volume2, Mic, FileText } from 'lucide-react'
import { useAIProctoring, type AIProctorStatus } from '../hooks/useAIProctoring'
import { useAudioProctoring, type AudioProctorStatus } from '../hooks/useAudioProctoring'
import type { ProctorEvent } from '../types'

interface AIProctorMonitorProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  active: boolean
  enableTranscription?: boolean
  onProctorEvent: (event: ProctorEvent) => void
}

export function AIProctorMonitor({
  videoRef,
  active,
  enableTranscription = false,
  onProctorEvent,
}: AIProctorMonitorProps) {
  const [aiStatus, setAiStatus] = useState<AIProctorStatus>({
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
  })
  const [audioStatus, setAudioStatus] = useState<AudioProctorStatus>({
    audioReady: false,
    audioError: null,
    audioLevel: 0,
    speakingAloud: false,
    transcriptionSupported: false,
    transcriptionActive: false,
    lastTranscript: null,
  })

  useAIProctoring(videoRef, active, onProctorEvent, setAiStatus)
  useAudioProctoring(videoRef, active, enableTranscription, onProctorEvent, setAudioStatus)

  const suspicious = audioStatus.speakingAloud
    ? [...aiStatus.suspicious, 'Sustained loud audio detected']
    : aiStatus.suspicious

  const riskLevel =
    suspicious.length === 0
      ? 'low'
      : suspicious.length === 1
        ? 'medium'
        : 'high'

  const riskColor = {
    low: 'border-verify-700 bg-verify-50 dark:border-verify-600 dark:bg-verify-100/10',
    medium: 'border-brass-600 bg-brass-50 dark:border-brass-600 dark:bg-brass-100/10',
    high: 'border-signal-700 bg-signal-50 dark:border-signal-600 dark:bg-signal-100/10',
  }

  const riskTextColor = {
    low: 'text-verify-700 dark:text-verify-600',
    medium: 'text-brass-700 dark:text-brass-100',
    high: 'text-signal-700 dark:text-signal-100',
  }

  const riskBadgeColor = {
    low: 'bg-verify-700',
    medium: 'bg-brass-600',
    high: 'bg-signal-700',
  }

  return (
    <div className="space-y-3">
      {/* Risk Level */}
      <div className={`border-2 p-3 ${riskColor[riskLevel]}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`h-3 w-3 rounded-full ${riskBadgeColor[riskLevel]} animate-pulse`}
            />
            <span className={`text-xs font-bold uppercase tracking-wider ${riskTextColor[riskLevel]}`}>
              {riskLevel === 'low' && '✓ Low Risk'}
              {riskLevel === 'medium' && '⚠ Medium Risk'}
              {riskLevel === 'high' && '🚨 High Risk'}
            </span>
          </div>
          <span className={`text-xs font-mono font-semibold ${riskTextColor[riskLevel]}`}>
            {aiStatus.modelReady ? `${aiStatus.confidence}% detection confidence` : 'Loading model…'}
          </span>
        </div>
      </div>

      {/* AI Metrics Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Face Detection */}
        <div
          className={`border p-3 transition-all ${
            aiStatus.facePresence
              ? 'border-verify-700 bg-verify-50 dark:border-verify-600 dark:bg-verify-100/10'
              : 'border-signal-700 bg-signal-50 dark:border-signal-600 dark:bg-signal-100/10'
          }`}
        >
          <div className="flex items-start gap-2">
            <CheckCircle
              className={`h-4 w-4 shrink-0 ${
                aiStatus.facePresence
                  ? 'text-verify-700 dark:text-verify-600'
                  : 'text-signal-700 dark:text-signal-100'
              }`}
            />
            <div className="flex-1">
              <p className="text-xs font-semibold text-ink-700 dark:text-paper-200">
                Face Detection
              </p>
              <p
                className={`text-xs font-mono ${
                  aiStatus.facePresence
                    ? 'text-verify-700 dark:text-verify-600'
                    : 'text-signal-700 dark:text-signal-100'
                }`}
              >
                {aiStatus.facePresence ? 'Detected' : 'Missing'}
              </p>
            </div>
          </div>
        </div>

        {/* Eye Contact */}
        <div
          className={`border p-3 transition-all ${
            aiStatus.attentionFocused && aiStatus.facePresence
              ? 'border-verify-700 bg-verify-50 dark:border-verify-600 dark:bg-verify-100/10'
              : 'border-brass-600 bg-brass-50 dark:border-brass-600 dark:bg-brass-100/10'
          }`}
        >
          <div className="flex items-start gap-2">
            <Eye
              className={`h-4 w-4 shrink-0 ${
                aiStatus.attentionFocused && aiStatus.facePresence
                  ? 'text-verify-700 dark:text-verify-600'
                  : 'text-brass-700 dark:text-brass-100'
              }`}
            />
            <div className="flex-1">
              <p className="text-xs font-semibold text-ink-700 dark:text-paper-200">
                Face Position
              </p>
              <p
                className={`text-xs font-mono ${
                  aiStatus.attentionFocused && aiStatus.facePresence
                    ? 'text-verify-700 dark:text-verify-600'
                    : 'text-brass-700 dark:text-brass-100'
                }`}
              >
                {aiStatus.attentionFocused && aiStatus.facePresence
                  ? 'In Focus'
                  : 'Outside Focus'}
              </p>
            </div>
          </div>
        </div>

        {/* People Count */}
        <div
          className={`border p-3 transition-all ${
            !aiStatus.multiplePeople
              ? 'border-verify-700 bg-verify-50 dark:border-verify-600 dark:bg-verify-100/10'
              : 'border-signal-700 bg-signal-50 dark:border-signal-600 dark:bg-signal-100/10'
          }`}
        >
          <div className="flex items-start gap-2">
            <Users
              className={`h-4 w-4 shrink-0 ${
                !aiStatus.multiplePeople
                  ? 'text-verify-700 dark:text-verify-600'
                  : 'text-signal-700 dark:text-signal-100'
              }`}
            />
            <div className="flex-1">
              <p className="text-xs font-semibold text-ink-700 dark:text-paper-200">
                People Detected
              </p>
              <p
                className={`text-xs font-mono font-bold ${
                  !aiStatus.multiplePeople
                    ? 'text-verify-700 dark:text-verify-600'
                    : 'text-signal-700 dark:text-signal-100'
                }`}
              >
                {aiStatus.facesDetected}
                {aiStatus.multiplePeople ? ' (⚠ Multiple)' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* Gaze Direction */}
        <div
          className={`border p-3 transition-all ${
            !aiStatus.facePresence
              ? 'border-paper-200 bg-paper-50 dark:border-ink-700 dark:bg-ink-dark-bg'
              : aiStatus.lookingAway
                ? 'border-signal-700 bg-signal-50 dark:border-signal-600 dark:bg-signal-100/10'
                : 'border-verify-700 bg-verify-50 dark:border-verify-600 dark:bg-verify-100/10'
          }`}
        >
          <div className="flex items-start gap-2">
            {aiStatus.lookingAway
              ? <EyeOff className="h-4 w-4 shrink-0 text-signal-700 dark:text-signal-100" />
              : <Eye className="h-4 w-4 shrink-0 text-verify-700 dark:text-verify-600" />}
            <div className="flex-1">
              <p className="text-xs font-semibold text-ink-700 dark:text-paper-200">
                Gaze Direction
              </p>
              <p
                className={`text-xs font-mono font-bold ${
                  !aiStatus.facePresence
                    ? 'text-ink-500 dark:text-ink-300'
                    : aiStatus.lookingAway
                      ? 'text-signal-700 dark:text-signal-100'
                      : 'text-verify-700 dark:text-verify-600'
                }`}
              >
                {!aiStatus.facePresence
                  ? '—'
                  : aiStatus.gazeDirection === 'left'  ? '⬅ Looking Left'
                  : aiStatus.gazeDirection === 'right' ? '➡ Looking Right'
                  : aiStatus.gazeDirection === 'up'    ? '⬆ Looking Up'
                  : aiStatus.gazeDirection === 'center'? '✓ On Screen'
                  :                                      'Calibrating…'}
              </p>
            </div>
          </div>
        </div>

        {/* Device Detection */}
        <div
          className={`border p-3 transition-all ${
            !aiStatus.deviceDetected
              ? 'border-verify-700 bg-verify-50 dark:border-verify-600 dark:bg-verify-100/10'
              : 'border-signal-700 bg-signal-50 dark:border-signal-600 dark:bg-signal-100/10'
          }`}
        >
          <div className="flex items-start gap-2">
            <Smartphone
              className={`h-4 w-4 shrink-0 ${
                !aiStatus.deviceDetected
                  ? 'text-verify-700 dark:text-verify-600'
                  : 'text-signal-700 dark:text-signal-100'
              }`}
            />
            <div className="flex-1">
              <p className="text-xs font-semibold text-ink-700 dark:text-paper-200">
                Device Scan
              </p>
              <p
                className={`text-xs font-mono font-bold ${
                  !aiStatus.deviceDetected
                    ? 'text-verify-700 dark:text-verify-600'
                    : 'text-signal-700 dark:text-signal-100'
                }`}
              >
                {!aiStatus.deviceDetected ? 'Clear' : 'Phone Detected!'}
              </p>
            </div>
          </div>
        </div>

        {/* Audio Level */}
        <div
          className={`border p-3 transition-all ${
            !audioStatus.audioReady
              ? 'border-paper-200 bg-paper-50 dark:border-ink-700 dark:bg-ink-dark-bg'
              : !audioStatus.speakingAloud
                ? 'border-verify-700 bg-verify-50 dark:border-verify-600 dark:bg-verify-100/10'
                : 'border-brass-600 bg-brass-50 dark:border-brass-600 dark:bg-brass-100/10'
          }`}
        >
          <div className="flex items-start gap-2">
            <Volume2
              className={`h-4 w-4 shrink-0 ${
                !audioStatus.audioReady
                  ? 'text-ink-300 dark:text-ink-500'
                  : !audioStatus.speakingAloud
                    ? 'text-verify-700 dark:text-verify-600'
                    : 'text-brass-700 dark:text-brass-100'
              }`}
            />
            <div className="flex-1">
              <p className="text-xs font-semibold text-ink-700 dark:text-paper-200">
                Audio Level
              </p>
              <p
                className={`text-xs font-mono font-bold ${
                  !audioStatus.audioReady
                    ? 'text-ink-500 dark:text-ink-300'
                    : !audioStatus.speakingAloud
                      ? 'text-verify-700 dark:text-verify-600'
                      : 'text-brass-700 dark:text-brass-100'
                }`}
              >
                {!audioStatus.audioReady ? 'Calibrating…' : `${audioStatus.audioLevel}/100${audioStatus.speakingAloud ? ' ⚠ Loud' : ''}`}
              </p>
            </div>
          </div>
        </div>

        {/* Threat Level */}
        <div
          className={`border p-3 transition-all ${
            suspicious.length === 0
              ? 'border-verify-700 bg-verify-50 dark:border-verify-600 dark:bg-verify-100/10'
              : 'border-signal-700 bg-signal-50 dark:border-signal-600 dark:bg-signal-100/10'
          }`}
        >
          <div className="flex items-start gap-2">
            <Zap
              className={`h-4 w-4 shrink-0 ${
                suspicious.length === 0
                  ? 'text-verify-700 dark:text-verify-600'
                  : 'text-signal-700 dark:text-signal-100'
              }`}
            />
            <div className="flex-1">
              <p className="text-xs font-semibold text-ink-700 dark:text-paper-200">
                Threat Level
              </p>
              <p
                className={`text-xs font-mono font-bold ${
                  suspicious.length === 0
                    ? 'text-verify-700 dark:text-verify-600'
                    : 'text-signal-700 dark:text-signal-100'
                }`}
              >
                {suspicious.length === 0 ? 'Safe' : `${suspicious.length} alerts`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Transcription status */}
      {enableTranscription && (
        <div className="border border-paper-200 bg-paper-50 p-3 dark:border-ink-700 dark:bg-ink-dark-bg">
          <div className="flex items-center gap-2">
            <Mic className={`h-4 w-4 shrink-0 ${audioStatus.transcriptionActive ? 'text-brass-600 dark:text-brass-100' : 'text-ink-300 dark:text-ink-500'}`} />
            <p className="text-xs font-semibold text-ink-700 dark:text-paper-200">
              Speech Transcription
            </p>
            <span className={`ml-auto text-xs font-mono ${audioStatus.transcriptionSupported ? 'text-ink-500 dark:text-ink-300' : 'text-brass-700 dark:text-brass-100'}`}>
              {!audioStatus.transcriptionSupported
                ? 'Unsupported in this browser'
                : audioStatus.transcriptionActive ? 'Listening' : 'Inactive'}
            </span>
          </div>
          {audioStatus.lastTranscript && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-700 dark:text-paper-200">
              <FileText className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Last detected: "{audioStatus.lastTranscript}"</span>
            </p>
          )}
        </div>
      )}

      {/* Suspicious Activities */}
      {(aiStatus.modelError || audioStatus.audioError) && (
        <div className="border border-signal-700 bg-signal-50 p-3 text-xs text-signal-700 dark:border-signal-600 dark:bg-signal-100/10 dark:text-signal-100">
          {aiStatus.modelError && <p>ML model error: {aiStatus.modelError}</p>}
          {audioStatus.audioError && <p>Audio error: {audioStatus.audioError}</p>}
        </div>
      )}
      {suspicious.length > 0 && (
        <div className="space-y-2 border border-signal-700 bg-signal-50 p-3 dark:border-signal-600 dark:bg-signal-100/10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-signal-700 dark:text-signal-100" />
            <p className="text-xs font-semibold text-signal-700 dark:text-signal-100">
              Flagged Activities
            </p>
          </div>
          <ul className="space-y-1">
            {suspicious.map((flag, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-xs text-signal-700 dark:text-signal-100"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-signal-700" />
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI Info */}
      <div className="border border-brass-600 bg-brass-50 p-2 dark:border-brass-600 dark:bg-brass-100/10">
        <p className="text-xs text-brass-700 dark:text-brass-100">
          🤖 <span className="font-semibold">AI Proctor</span> — Real-time face, behavior, and audio-level analysis run locally and never leave this device.
          {enableTranscription && audioStatus.transcriptionSupported && (
            <> Speech transcription is the one exception: short audio clips are sent to your browser's speech service to produce text.</>
          )}
        </p>
      </div>
    </div>
  )
}
