export function readAudioDuration(file: File): Promise<number | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    audio.preload = 'metadata'

    const cleanup = () => URL.revokeObjectURL(url)

    audio.onloadedmetadata = () => {
      cleanup()
      const d = audio.duration
      resolve(Number.isFinite(d) ? Math.round(d) : null)
    }

    audio.onerror = () => {
      cleanup()
      resolve(null)
    }

    audio.src = url
  })
}

export async function computePeaksFromBuffer(
  arrayBuffer: ArrayBuffer,
  bars = 128
): Promise<number[] | null> {
  try {
    const AudioCtx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return null

    const ctx = new AudioCtx()
    let audioBuffer: AudioBuffer
    try {
      audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    } finally {
      ctx.close()
    }

    const channel = audioBuffer.getChannelData(0)
    const block = Math.floor(channel.length / bars) || 1
    const stride = Math.max(1, Math.floor(block / 200))
    const peaks: number[] = []

    for (let i = 0; i < bars; i++) {
      let max = 0
      const start = i * block
      const end = Math.min(start + block, channel.length)
      for (let j = start; j < end; j += stride) {
        const v = Math.abs(channel[j])
        if (v > max) max = v
      }
      peaks.push(max)
    }

    const loudest = Math.max(...peaks)
    return loudest > 0 ? peaks.map(p => Math.round((p / loudest) * 1000) / 1000) : peaks
  } catch {
    return null
  }
}

export async function computePeaks(file: File, bars = 128): Promise<number[] | null> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    return computePeaksFromBuffer(arrayBuffer, bars)
  } catch {
    return null
  }
}

export function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Upload failed')))
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.send(file)
  })
}
