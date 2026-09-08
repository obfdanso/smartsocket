import { useEffect } from 'react'
import { LogoMark } from './components'

/**
 * Holds for a beat, then hands over.
 *
 * A splash exists to cover a slow start, and this app has none - so it earns
 * its place by being where the mark is introduced, not by pretending to load.
 * Hence the short, fixed hold rather than a spinner tied to nothing.
 */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 800)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="center-screen">
      <LogoMark size={132} />
      <div
        style={{
          marginTop: 28,
          color: 'var(--gold)',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '1.4px',
        }}
      >
        SMART SOCKET
      </div>
      <p className="body" style={{ marginTop: 8 }}>
        Cuts the wall when your battery is full
      </p>
    </div>
  )
}
