/**
 * Mirrors `SocketState` in `SmartSocket/src/core/Types.h`.
 *
 * The ordinals are the wire format - the firmware sends the number, not the
 * name, because a 32 KB part has better uses for its flash than strings the
 * client already has. **If the enum in Types.h gains a member anywhere but the
 * end, this list has to move with it.**
 */
export enum SocketState {
  Calibrating = 0,
  Ready = 1,
  Settling = 2,
  Charging = 3,
  Cutoff = 4,
  Fault = 5,
  ManualOff = 6,
  Probing = 7,
  RelayStuck = 8,
}

/** Word for word what the phone and the desktop app show. */
export const STATE_LABEL: Record<SocketState, string> = {
  [SocketState.Calibrating]: 'Calibrating',
  [SocketState.Ready]: 'Ready',
  [SocketState.Settling]: 'Settling',
  [SocketState.Charging]: 'Charging',
  [SocketState.Cutoff]: 'Power cut',
  [SocketState.Fault]: 'Overcurrent',
  [SocketState.ManualOff]: 'Switched off',
  [SocketState.Probing]: 'Checking',
  [SocketState.RelayStuck]: 'Relay stuck',
}

export const STATE_DETAIL: Record<SocketState, string> = {
  [SocketState.Calibrating]: "Measuring the sensor's zero point",
  [SocketState.Ready]: 'Waiting for something to be plugged in',
  [SocketState.Settling]: "Ignoring the charger's inrush",
  [SocketState.Charging]: 'Watching for the current to taper',
  [SocketState.Cutoff]: 'Charged. Power is off',
  [SocketState.Fault]: 'Something is wrong. Unplug at the wall',
  [SocketState.ManualOff]: 'You turned it off',
  [SocketState.Probing]: 'Looking for a load',
  [SocketState.RelayStuck]: 'Power is still flowing. Unplug at the wall',
}

export const isPowerOn = (s: SocketState): boolean =>
  s === SocketState.Ready ||
  s === SocketState.Settling ||
  s === SocketState.Charging ||
  s === SocketState.Probing

export const isAlarm = (s: SocketState): boolean =>
  s === SocketState.Fault || s === SocketState.RelayStuck

export const stateFromOrdinal = (value: number): SocketState | null =>
  value >= 0 && value <= SocketState.RelayStuck ? (value as SocketState) : null

/** One decoded status line. */
export interface SocketStatus {
  state: SocketState
  currentMa: number
  peakMa: number
  thresholdMa: number
  sessionElapsedMs: number
  cutoffCount: number
  totalSavedMs: number
  relayClosed: boolean
}

export const UNKNOWN_STATUS: SocketStatus = {
  state: SocketState.Calibrating,
  currentMa: 0,
  peakMa: 0,
  thresholdMa: 0,
  sessionElapsedMs: 0,
  cutoffCount: 0,
  totalSavedMs: 0,
  relayClosed: false,
}

export const amps = (ma: number): number => ma / 1000

/** Commands the socket accepts. One byte each - see `HalTelemetry::pump`. */
export const SocketCommand = {
  Cut: 'C',
  Rearm: 'R',
  Probe: 'P',
  StatusNow: '?',
  /** Zero the socket's lifetime cutoff count and saved-time total. */
  ResetTotals: 'Z',
} as const

export type SocketCommand = (typeof SocketCommand)[keyof typeof SocketCommand]
