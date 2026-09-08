/**
 * How long to wait before the nth retry.
 *
 * Two cases pull in opposite directions: a radio glitch wants a retry
 * immediately, and someone who walked into another room wants one much later.
 * The ceiling serves the second without making the first wait.
 *
 * A direct port of the Kotlin and C# schedules, so all three clients give up -
 * or keep trying - at the same moments.
 */
export const MAX_ATTEMPTS = 12
export const CEILING_MS = 60_000
const FIRST_DELAY_MS = 2_000

/** Null once the escalating part of the schedule has run out. */
export function delayMsFor(attempt: number): number | null {
  if (attempt < 0 || attempt >= MAX_ATTEMPTS) return null
  return Math.min(FIRST_DELAY_MS * 2 ** attempt, CEILING_MS)
}
