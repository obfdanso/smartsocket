/**
 * One completed charge, and the record of them.
 *
 * The encoding is deliberately the same four fields the phone and the desktop
 * app write, in the same order, so a CSV exported from any of the three lines
 * up column for column and exports can be concatenated.
 */
export interface ChargeSession {
  endedAtMillis: number
  peakMa: number
  cutAtMa: number
  durationMs: number
}

export const peakAmps = (s: ChargeSession): number => s.peakMa / 1000

export const taperFraction = (s: ChargeSession): number =>
  s.peakMa <= 0 ? 0 : Math.min(1, Math.max(0, s.cutAtMa / s.peakMa))

/**
 * The flat store.
 *
 * `localStorage` rather than IndexedDB for the same reason the phone uses a
 * flat file rather than Room: this is four integers a row and will never hold
 * more than sixty of them. A database would be all ceremony.
 */
const KEY = 'smartsocket.history'
const CAP = 60

export function loadHistory(): ChargeSession[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChargeSession[]
    return Array.isArray(parsed) ? parsed.slice(0, CAP) : []
  } catch {
    // A corrupt or unreadable store is not worth taking the app down for. An
    // empty history is wrong; a white screen is worse.
    return []
  }
}

/** Newest first, capped. Returns the new list so callers can render it. */
export function recordSession(session: ChargeSession): ChargeSession[] {
  const next = [session, ...loadHistory()].slice(0, CAP)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private browsing, or the quota is full. The list in memory is still right.
  }
  return next
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing useful to do.
  }
}

export const CSV_HEADER = 'ended_at,ended_at_ms,peak_ma,cut_at_ma,duration_ms,taper_percent'
export const CSV_FILE_NAME = 'smart-socket-history.csv'

const two = (n: number) => String(n).padStart(2, '0')

/**
 * The history as a spreadsheet.
 *
 * Two time columns: an ISO-ish one for a human and a millisecond one for a
 * spreadsheet that will not parse it. Rows run **oldest first**, the reverse of
 * the screen - the newest charge belongs at the top of a list, but a column a
 * spreadsheet is going to plot has to run forwards.
 */
export function renderCsv(sessions: ChargeSession[]): string {
  const rows = [...sessions].sort((a, b) => a.endedAtMillis - b.endedAtMillis)

  return rows.reduce((out, s) => {
    const d = new Date(s.endedAtMillis)
    const stamp =
      `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ` +
      `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`

    return (
      out +
      '\n' +
      [
        stamp,
        s.endedAtMillis,
        s.peakMa,
        s.cutAtMa,
        s.durationMs,
        Math.trunc(taperFraction(s) * 100),
      ].join(',')
    )
  }, CSV_HEADER)
}

/** Hands the CSV to the browser as a download. */
export function downloadCsv(sessions: ChargeSession[]): void {
  const blob = new Blob([renderCsv(sessions)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = CSV_FILE_NAME
  link.click()

  // Revoked on the next turn of the loop: revoking synchronously can beat the
  // download starting in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
