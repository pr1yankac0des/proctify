import { FaceDetector, ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision'

let faceDetectorPromise: Promise<FaceDetector> | null = null
let objectDetectorPromise: Promise<ObjectDetector> | null = null

function assetPath(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.replace(/\/?$/, '/')}${path.replace(/^\//, '')}`
}

async function createFaceDetector(): Promise<FaceDetector> {
  try {
    const vision = await FilesetResolver.forVisionTasks(assetPath('mediapipe'))
    const options = {
      baseOptions: { modelAssetPath: assetPath('models/blaze_face_short_range.tflite') },
      runningMode: 'VIDEO' as const,
      minDetectionConfidence: 0.65,
      minSuppressionThreshold: 0.3,
    }
    return await FaceDetector.createFromOptions(vision, options)
  } catch (e) {
    console.warn('Failed to load face detector locally, trying CDN fallback...', e)
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm')
    const options = {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite' },
      runningMode: 'VIDEO' as const,
      minDetectionConfidence: 0.65,
      minSuppressionThreshold: 0.3,
    }
    return FaceDetector.createFromOptions(vision, options)
  }
}

export function getFaceDetector(): Promise<FaceDetector> {
  faceDetectorPromise ??= createFaceDetector().catch((error) => {
    faceDetectorPromise = null
    throw error
  })
  return faceDetectorPromise
}

async function createObjectDetector(): Promise<ObjectDetector> {
  try {
    const vision = await FilesetResolver.forVisionTasks(assetPath('mediapipe'))
    const options = {
      baseOptions: { modelAssetPath: assetPath('models/efficientdet_lite0.tflite') },
      runningMode: 'VIDEO' as const,
      scoreThreshold: 0.25,
    }
    return await ObjectDetector.createFromOptions(vision, options)
  } catch (e) {
    console.warn('Failed to load object detector locally, trying CDN fallback...', e)
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm')
    const options = {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite' },
      runningMode: 'VIDEO' as const,
      scoreThreshold: 0.25,
    }
    return ObjectDetector.createFromOptions(vision, options)
  }
}

export function getObjectDetector(): Promise<ObjectDetector> {
  objectDetectorPromise ??= createObjectDetector().catch((error) => {
    objectDetectorPromise = null
    throw error
  })
  return objectDetectorPromise
}

