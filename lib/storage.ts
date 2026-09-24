import * as Minio from 'minio'

const endPoint = process.env.MINIO_ENDPOINT ?? 'localhost'
const port = Number(process.env.MINIO_PORT ?? 9000)
const useSSL = process.env.MINIO_USE_SSL === 'true'

export const BUCKET_AUDIO = process.env.MINIO_BUCKET_AUDIO ?? 'beat-audio'
export const BUCKET_ARTWORK = process.env.MINIO_BUCKET_ARTWORK ?? 'beat-artwork'

export const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aiff',
  'audio/x-aiff',
  'audio/flac',
  'audio/x-flac',
]

export const ARTWORK_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
]

export const MAX_AUDIO_BYTES = 250 * 1024 * 1024
export const MAX_ARTWORK_BYTES = 20 * 1024 * 1024

let client: Minio.Client | null = null

function getClient() {
  if (!client) {
    client = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    })
  }
  return client
}

export function buildKey(kind: 'audio' | 'artwork', userId: string, ext: string) {
  const safeExt = ext.replace(/^\./, '').toLowerCase() || 'bin'
  const id = crypto.randomUUID()
  return `${kind}/${userId}/${id}.${safeExt}`
}

export function publicUrl(bucket: string, key: string) {
  const protocol = useSSL ? 'https' : 'http'
  return `${protocol}://${endPoint}:${port}/${bucket}/${key}`
}

export async function presignUpload(bucket: string, key: string, expirySeconds = 900) {
  return getClient().presignedPutObject(bucket, key, expirySeconds)
}

export async function presignDownload(bucket: string, key: string, expirySeconds = 3600) {
  return getClient().presignedGetObject(bucket, key, expirySeconds)
}

export async function deleteObject(bucket: string, key: string) {
  return getClient().removeObject(bucket, key)
}

export function extensionFromMime(mime: string) {
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/aiff': 'aiff',
    'audio/x-aiff': 'aiff',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
  }
  return map[mime.toLowerCase()] ?? 'bin'
}
