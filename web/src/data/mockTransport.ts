import {
  SocketCommand,
  SocketState,
  UNKNOWN_STATUS,
  isAlarm,
  isPowerOn,
  type SocketStatus,
} from './socketStatus'
import type { LinkState, SocketDevice, SocketTransport } from './transport'

/**
 * A socket that exists only in software.
 *
 * Not a stub returning canned values - it runs the same sequence the real
 * firmware does, in real time: settle, charge, taper, cut.
 *
 * **It runs once and stops.** A demo that returns to the beginning on its own
 * shows the socket apparently cutting power over and over, and drives the
 * lifetime counters to numbers no real socket would reach in a day. One charge,
 * watched to its end, is what the product actually does.
 *
 * A line-for-line port of the Kotlin and C# simulators, down to the constants,
 * so all three demos show the same socket behaving the same way.
 */
const TICK_MS = 1_000
const READY_SECONDS = 60
const SETTLING_SECONDS = 60
const CHARGING_SECONDS = 1_400
const CUTOFF_SECONDS = 240

/** Where the plateau ends and the taper begins, as a fraction of the charge. */
const KNEE_AT = 0.55
const PLATEAU_MA = 150
const TRICKLE_MA = 66
const THRESHOLD_MA = 100

/**
 * A charger's current over time: a long plateau, a knee, then a decaying tail.
 *
 * Exponential rather than linear because that is the shape the real thing makes
 * - steep at the knee and flattening out, which is exactly why the firmware
 * needs a confirmation window rather than one reading below the threshold.
 */
function chargeCurrentMa(second: number): number {
  const t = second / CHARGING_SECONDS

  if (t < KNEE_AT) {
    // Not flat: a real reading jitters by a count or two, and a perfectly
    // constant number looks like a frozen screen.
    return PLATEAU_MA + ((second % 7) - 3)
  }

  const k = (t - KNEE_AT) / (1 - KNEE_AT)
  return Math.round(TRICKLE_MA + (PLATEAU_MA - TRICKLE_MA) * Math.exp(-3 * k))
}

export class MockTransport implements SocketTransport {
  private statusFn: (s: SocketStatus) => void = () => {}
  private linkFn: (s: LinkState) => void = () => {}

  private timer: ReturnType<typeof setTimeout> | null = null
  private status: SocketStatus = UNKNOWN_STATUS

  /** Carried across restarts, so a re-arm continues the socket's life. */
  private cutoffs = 0
  private savedMs = 0

  onStatus(fn: (s: SocketStatus) => void) { this.statusFn = fn }
  onLinkState(fn: (s: LinkState) => void) { this.linkFn = fn }

  async connect(device: SocketDevice): Promise<boolean> {
    this.linkFn({ kind: 'connecting' })
    await new Promise((r) => setTimeout(r, 700))
    this.linkFn({ kind: 'connected', device })

    this.cutoffs = 0
    this.savedMs = 0
    this.restart(false)
    return true
  }

  /**
   * Accepted and ignored. The demo has no display to update and no charge
   * policy to hand over, so `A`, `B`, `T` and `L` lines have nothing to do.
   */
  async sendLine(_line: string): Promise<void> {}

  /**
   * THE BUTTONS TAKE THE SOCKET OVER, and the script lets go.
   *
   * They used to set a state the script overwrote a fraction of a second later,
   * so "Cut power" flickered and carried on charging - the one control anybody
   * demonstrating this is certain to press, doing visibly nothing.
   */
  async send(command: string): Promise<void> {
    const now = this.status

    if (command === SocketCommand.Cut && isPowerOn(now.state)) {
      this.stop()
      // Counted, because it is a real cutoff: the lifetime total has to match
      // what the person watching just saw happen.
      this.cutoffs += 1
      this.publish({
        ...now,
        state: SocketState.Cutoff,
        currentMa: 0,
        peakMa: 0,
        relayClosed: false,
        cutoffCount: this.cutoffs,
      })
      return
    }

    if (command === SocketCommand.Rearm && (now.state === SocketState.Cutoff || isAlarm(now.state))) {
      this.publish({ ...now, state: SocketState.Ready, relayClosed: true })
      // Straight back to charging. Sitting through another minute of "waiting
      // for something to be plugged in" is not what someone who just pressed
      // Re-arm is asking for.
      this.restart(true)
      return
    }

    if (command === SocketCommand.Probe && now.state === SocketState.Cutoff) {
      this.publish({ ...now, state: SocketState.Probing, relayClosed: true })
      this.restart(true)
      return
    }

    if (command === SocketCommand.ResetTotals) {
      this.cutoffs = 0
      this.savedMs = 0
      this.publish({ ...now, cutoffCount: 0, totalSavedMs: 0 })
    }
  }

  disconnect(): void {
    this.stop()
    this.cutoffs = 0
    this.savedMs = 0
    this.status = UNKNOWN_STATUS
    this.statusFn(UNKNOWN_STATUS)
    this.linkFn({ kind: 'idle' })
  }

  private stop() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  /**
   * One charge, start to finish, then it stays cut.
   *
   * Deliberately no probe-and-resume at the end. Probing is what leads back
   * into charging, and a demo that returns to the beginning on its own is the
   * looping this was written to stop.
   *
   * Driven by a chained timeout rather than an interval: a tab that is
   * backgrounded has its timers throttled, and an interval would pile up
   * missed ticks and then fire them all at once when the tab came back.
   */
  private restart(fromCharging: boolean) {
    this.stop()

    const steps: Array<() => void> = []

    if (!fromCharging) {
      for (let i = 0; i < READY_SECONDS; i++) {
        steps.push(() => this.emit(SocketState.Ready, 0, 0, 0, 0, true))
      }
    }

    for (let i = 0; i < SETTLING_SECONDS; i++) {
      steps.push(() => this.emit(SocketState.Settling, PLATEAU_MA + 5, 0, 0, 0, true))
    }

    let peak = 0
    for (let second = 0; second < CHARGING_SECONDS; second++) {
      const s = second
      steps.push(() => {
        const ma = chargeCurrentMa(s)
        if (ma > peak) peak = ma
        this.emit(SocketState.Charging, ma, peak, THRESHOLD_MA, s * 1000, true)
      })
    }

    steps.push(() => {
      this.cutoffs += 1
      this.emit(SocketState.Cutoff, 0, 0, 0, 0, false)
    })

    // Sit cut, accumulating the time the wall was off, and then simply stop.
    // The buttons still work: the socket is left where a real one would be,
    // waiting for someone to re-arm it.
    for (let i = 0; i < CUTOFF_SECONDS; i++) {
      steps.push(() => {
        this.savedMs += TICK_MS
        this.emit(SocketState.Cutoff, 0, 0, 0, 0, false)
      })
    }

    let index = 0
    const tick = () => {
      if (index >= steps.length) { this.timer = null; return }
      steps[index++]()
      this.timer = setTimeout(tick, TICK_MS)
    }
    tick()
  }

  private emit(
    state: SocketState,
    currentMa: number,
    peakMa: number,
    thresholdMa: number,
    elapsedMs: number,
    relayClosed: boolean,
  ) {
    this.publish({
      state,
      currentMa,
      peakMa,
      thresholdMa,
      sessionElapsedMs: elapsedMs,
      cutoffCount: this.cutoffs,
      totalSavedMs: this.savedMs,
      relayClosed,
    })
  }

  private publish(s: SocketStatus) {
    this.status = s
    this.statusFn(s)
  }
}
