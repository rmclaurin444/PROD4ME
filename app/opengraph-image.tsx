import { ImageResponse } from 'next/og'

export const alt = 'PROD4ME — Your sound. Your terms.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Basic Open Graph card for link previews (black and white brand). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#000',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 20,
              background: '#fff',
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 60,
              fontWeight: 900,
            }}
          >
            P4
          </div>
          <div style={{ display: 'flex', fontSize: 110, fontWeight: 900, letterSpacing: -4 }}>
            PROD<span style={{ color: '#a3a3a3' }}>4</span>ME
          </div>
        </div>
        <div style={{ marginTop: 36, fontSize: 44, fontWeight: 700 }}>Your sound. Your terms.</div>
        <div style={{ marginTop: 16, fontSize: 30, color: '#a3a3a3' }}>
          Discover, upload, and negotiate the next beat.
        </div>
      </div>
    ),
    size
  )
}
