import { stateFromOrdinal, type SocketStatus } from './socketStatus'

/**
 * Decodes one `S,...` line, or returns null.
 *
 * STRICT ON PURPOSE. A Bluetooth link drops mid-line every time the device
 * moves out of range, so partial and corrupt lines are the normal case - and a
 * half-parsed line would put a number on screen that never existed.
 *
 * A direct port of the Kotlin and C# parsers, field for field. Three clients
 * that disagree about the wire format would show different numbers for the same
 * socket.
 */
const FIELD_COUNT = 9

const int = (s: string): number | null => {
  const t = s.trim()
  if (!/^-?\d+$/.test(t)) return null
  return Number.parseInt(t, 10)
}

export function parseStatus(line: string): SocketStatus | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('S,')) return null

  const parts = trimmed.split(',')
  if (parts.length !== FIELD_COUNT) return null

  const ordinal = int(parts[1])
  if (ordinal === null) return null
  const state = stateFromOrdinal(ordinal)
  if (state === null) return null

  const currentMa = int(parts[2])
  const peakMa = int(parts[3])
  const thresholdMa = int(parts[4])
  const sessionElapsedMs = int(parts[5])
  const cutoffCount = int(parts[6])
  const totalSavedMs = int(parts[7])

  if (
    currentMa === null ||
    peakMa === null ||
    thresholdMa === null ||
    sessionElapsedMs === null ||
    cutoffCount === null ||
    totalSavedMs === null
  ) {
    return null
  }

  return {
    state,
    currentMa,
    peakMa,
    thresholdMa,
    sessionElapsedMs,
    cutoffCount,
    totalSavedMs,
    relayClosed: parts[8].trim() === '1',
  }
}
