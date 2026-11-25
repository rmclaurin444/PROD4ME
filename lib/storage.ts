import * as Minio from 'minio'
import { getAppUrl } from './app-url.ts'

// MINIO_ENDPOINT may be given as a bare host or a full URL (Railway bucket
// variables are URLs) — strip the scheme and any path.
const endPoint = (process.env.MINIO_ENDPOINT ?? 'localhost').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
const port = Number(process.env.MINIO_PORT ?? 9000)
const useSSL = process.env.MINIO_USE_SSL === 'true'
// Railway Buckets: region from the bucket's credentials, virtual-hosted-style
// URLs (MINIO_PATH_STYLE=false). Local MinIO: us-east-1, path-style.
const region = process.env.MINIO_REGION || 'us-east-1'
const pathStyle = process.env.MINIO_PATH_STYLE !== 'false'
// MEDIA_PROXY=1 (Railway): buckets are private, so images are served through
// the /api/media redirect route instead of direct bucket URLs.
const mediaProxy = process.env.MEDIA_PROXY === '1'

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
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

let client: Minio.Client | null = null

function getClient() {
  if (!client) {
    client = new Minio.Client({
      endPoint,
      port,
      useSSL,
      region,
      pathStyle,
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    })
  }
  return client
}

export function buildKey(kind: 'audio' | 'artwork' | 'avatars' | 'banners', userId: string, ext: string) {
  const safeExt = ext.replace(/^\./, '').toLowerCase() || 'bin'
  const id = crypto.randomUUID()
  if (kind === 'avatars' || kind === 'banners') return `${kind}/${userId}/${id}.${safeExt}`
  return `${kind}/${userId}/${id}.${safeExt}`
}

/** Key prefixes the /api/media route may serve (artwork bucket only). */
export const MEDIA_KEY_PREFIXES = ['artwork/', 'avatars/', 'banners/'] as const

export function isMediaKey(key: string): boolean {
  return (
    MEDIA_KEY_PREFIXES.some(prefix => key.startsWith(prefix)) &&
    !key.includes('..') &&
    !key.includes('//') &&
    !key.includes('\\')
  )
}

/**
 * Browser-facing URL for a public image (artwork, avatars, banners, playlist
 * covers). Every caller goes through here.
 *  - MEDIA_PROXY=1 (Railway, private buckets): `${APP_URL}/api/media/<key>`,
 *    which 302-redirects to a short-lived presigned GET.
 *  - MINIO_PUBLIC_ENDPOINT: legacy public-host mode (bucket name in the path);
 *    not used on Railway.
 *  - otherwise: the local MinIO endpoint (artwork bucket is public-read).
 */
export function publicUrl(bucket: string, key: string) {
  if (mediaProxy) {
    const encoded = key.split('/').map(encodeURIComponent).join('/')
    return `${getAppUrl()}/api/media/${encoded}`
  }
  const publicHost = process.env.MINIO_PUBLIC_ENDPOINT
  if (publicHost) return `https://${publicHost.replace(/^https?:\/\//, '')}/${bucket}/${key}`
  const protocol = useSSL ? 'https' : 'http'
  const portSuffix = useSSL && port === 443 ? '' : `:${port}`
  return `${protocol}://${endPoint}${portSuffix}/${bucket}/${key}`
}

export async function presignUpload(bucket: string, key: string, expirySeconds = 900) {
  return getClient().presignedPutObject(bucket, key, expirySeconds)
}

/** Server-side direct upload (dev seeding tools); browsers use presigned PUTs. */
export async function putObject(bucket: string, key: string, body: Buffer, contentType: string) {
  return getClient().putObject(bucket, key, body, undefined, { 'Content-Type': contentType })
}

/** Server-side copy within a bucket — no bytes flow through Node. */
export async function copyObject(bucket: string, targetKey: string, sourceKey: string) {
  return getClient().copyObject(bucket, targetKey, `/${bucket}/${sourceKey}`)
}

/** Lists object keys+sizes under a prefix (dev audio pool). */
export async function listObjectEntries(
  bucket: string,
  prefix: string
): Promise<{ key: string; size: number }[]> {
  const stream = getClient().listObjectsV2(bucket, prefix, true)
  const out: { key: string; size: number }[] = []
  for await (const obj of stream) {
    if (obj.name) out.push({ key: obj.name, size: obj.size ?? 0 })
  }
  return out
}

export async function presignDownload(bucket: string, key: string, expirySeconds = 3600) {
  return getClient().presignedGetObject(bucket, key, expirySeconds)
}

export async function presignAttachmentDownload(
  bucket: string,
  key: string,
  expirySeconds = 300,
  filename: string
) {
  return getClient().presignedGetObject(
    bucket,
    key,
    expirySeconds,
    { 'response-content-disposition': `attachment; filename="${filename}"` }
  )
}

export async function deleteObject(bucket: string, key: string) {
  return getClient().removeObject(bucket, key)
}

export async function objectExists(bucket: string, key: string) {
  try {
    await getClient().statObject(bucket, key)
    return true
  } catch {
    return false
  }
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
