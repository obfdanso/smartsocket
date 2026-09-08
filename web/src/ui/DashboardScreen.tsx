import { useEffect, useRef, useState } from 'react'
import {
  SocketCommand,
  SocketState,
  STATE_DETAIL,
  STATE_LABEL,
  amps,
  isAlarm,
  isPowerOn,
  type SocketStatus,
} from '../data/socketStatus'
import { MAX_ATTEMPTS } from '../data/reconnectPolicy'
import type { LinkState } from '../data/transport'
import { Dialog, FieldLabel, LogoMark, OutlineButton, Panel, StatePill, Stat } from './components'

/**
 * Nominal UK mains, for turning a measured current into a power figure.
 *
 * The socket has no voltmeter - mains never touches the low-voltage side - so
 * this is the one number in the app that is assumed rather than measured.
 */
const MAINS_VOLTS = 230

/** Stands in for a value that exists but has not been measured yet. */
const NOT_YET = '—'

/**
 * Electricity the socket kept out of the wall, in watt-hours.
 *
 * Two measurements and one assumption: the heaviest current the socket saw, how
 * long it then held the relay open, and nominal mains for the voltage it cannot
 * measure. Power times time, which is what a meter would have charged for had
 * the socket not cut.
 *
 * An em dash until both halves exist - "0.00 Wh" claims a measurement of
 * nothing where the truth is that nothing has been measured.
 */
function energySaved(heaviestMa: number, savedMs: number): string {
  if (heaviestMa <= 0 || savedMs <= 0) return NOT_YET

  const watts = (heaviestMa * MAINS_VOLTS) / 1000
  const wh = watts * (savedMs / 3_600_000)

  // Scaled precision. A socket cut for a minute has saved hundredths of a
  // watt-hour, one left overnight has saved tens, and one format cannot serve
  // both without either lying or reading as zero.
  if (wh >= 10) return `${wh.toFixed(0)} Wh`
  if (wh >= 1) return `${wh.toFixed(1)} Wh`
  return `${wh.toFixed(2)} Wh`
}

const tintFor = (s: SocketState): string => {
  if (s === SocketState.Charging || s === SocketState.Settling) return 'var(--live)'
  if (s === SocketState.Cutoff) return 'var(--gold)'
  if (s === SocketState.Fault || s === SocketState.RelayStuck) return 'var(--alarm)'
  if (s === SocketState.Probing) return 'var(--caution)'
  return 'var(--muted)'
}

export interface DashboardProps {
  status: SocketStatus
  link: LinkState
  deviceName: string
  isDemo: boolean
  batteryPercent: number | null
  batteryLimit: number
  resumeAt: number
  appManaging: boolean
  charging: boolean
  onCommand: (c: string) => void
  onBatteryLimit: (n: number) => void
  onAppManaging: (on: boolean) => void
  onDisconnect: () => void
  onHistory: () => void
}

export function DashboardScreen(p: DashboardProps) {
  const reconnecting = p.link.kind === 'reconnecting' ? p.link : null
  const live = reconnecting === null
  const tint = tintFor(p.status.state)

  /**
   * The heaviest draw seen since this screen opened.
   *
   * Kept because the firmware clears the session peak the instant the socket
   * cuts, so reading the live value would blank the energy figure at exactly
   * the moment it is worth showing - the one right after the wall went off.
   */
  const heaviest = useRef(0)
  if (p.status.peakMa > heaviest.current) heaviest.current = p.status.peakMa

  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [dragging, setDragging] = useState<number | null>(null)
  const shown = dragging ?? p.batteryLimit

  // Back closes the socket rather than the tab. Reached through history so the
  // browser's own back gesture lands here instead of leaving the app.
  useEffect(() => {
    const onPop = () => setConfirmDisconnect(true)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /*
    THE BIG NUMBER IS WHATEVER IS ACTUALLY WORTH KNOWING.

    It used to be the current, always. On a phone that is a guaranteed 0.00 A -
    charging draws about 20 mA, below one ADC count on the ACS712-5A - so the
    screen's largest, most confident element was a permanent zero, and it read
    as a fault rather than as a limit of the sensor.
  */
  const showBattery =
    p.charging && p.status.state === SocketState.Ready && p.batteryPercent !== null

  return (
    <>
      {/*
        Stacked on a phone, two columns on anything wide enough - the socket's
        own readings on the left, this device's settings on the right. The split
        is the one the page already had vertically, so nothing has to be read in
        a different order.
      */}
      <div className="dash">
        <div className="dash-head">
      <div className="row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoMark size={40} />
          <div>
            {/* The simulated socket does not announce itself by name. "Demo
                socket" labels a thing that is not there, and next to a live
                current reading it invites the reader to distrust the reading. */}
            {!p.isDemo && <div className="title">{p.deviceName}</div>}
            <div
              className="label"
              style={{
                color: reconnecting
                  ? 'var(--gold)'
                  : p.status.relayClosed
                    ? 'var(--caution)'
                    : 'var(--muted)',
              }}
            >
              {reconnecting ? 'Reconnecting' : p.status.relayClosed ? 'Outlet live' : 'Outlet off'}
            </div>
          </div>
        </div>
        <OutlineButton dense tint="var(--alarm)" onClick={() => setConfirmDisconnect(true)}>
          Disconnect
        </OutlineButton>
      </div>

      {reconnecting && (
        <Panel accent>
          <div className="row">
            <div className="title">Reconnecting</div>
            <div className="label">
              {reconnecting.attempt} of {MAX_ATTEMPTS}
            </div>
          </div>
          <p className="body" style={{ marginTop: 8 }}>
            The link dropped. The readings below are the last ones the socket sent. It
            keeps working on its own while this reconnects.
          </p>
        </Panel>
      )}
        </div>

        <div className="dash-main">
      <Panel accent={isAlarm(p.status.state)}>
        <StatePill label={showBattery ? 'CHARGING' : STATE_LABEL[p.status.state]} tint={tint} />
        <div style={{ height: 22 }} />

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <span className="display">
            {showBattery ? p.batteryPercent : amps(p.status.currentMa).toFixed(2)}
          </span>
          <span
            style={{ fontSize: 24, fontWeight: 300, color: 'var(--muted)', paddingBottom: 12 }}
          >
            {showBattery ? '%' : 'A'}
          </span>
        </div>

        <p className="body" style={{ marginTop: 6 }}>
          {showBattery
            ? p.appManaging
              ? `Charging to ${p.batteryLimit}%. The socket can't measure a phone, so this app tells it when to stop.`
              : "Charging. The socket can't measure a phone — turn on app management below to have it stopped at a percentage."
            : STATE_DETAIL[p.status.state]}
        </p>

        {p.status.state === SocketState.Charging && p.status.peakMa > 0 && (
          <TaperBar status={p.status} />
        )}
      </Panel>

      {/* Nothing can be commanded down a link that is not there. A button that
          looks like it worked and did not is worse than a dead one on a device
          that switches mains. */}
      <div style={{ display: 'flex', gap: 10 }}>
        <OutlineButton
          full
          tint="var(--alarm)"
          disabled={!live || !isPowerOn(p.status.state)}
          onClick={() => p.onCommand(SocketCommand.Cut)}
        >
          Cut power
        </OutlineButton>
        <OutlineButton
          full
          tint="var(--gold)"
          disabled={!live || !(p.status.state === SocketState.Cutoff || isAlarm(p.status.state))}
          onClick={() => p.onCommand(SocketCommand.Rearm)}
        >
          Re-arm
        </OutlineButton>
      </div>

      {p.status.state === SocketState.Cutoff && (
        <OutlineButton full disabled={!live} onClick={() => p.onCommand(SocketCommand.Probe)}>
          Check for a device now
        </OutlineButton>
      )}
        </div>

        <div className="dash-side">
      <Panel>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>This device</FieldLabel>
            <div className="title" style={{ marginTop: 6 }}>
              {p.appManaging
                ? `Charge to ${p.batteryLimit}%, back on at ${p.resumeAt}%`
                : 'The socket decides for itself'}
            </div>
          </div>
          <div
            className="title"
            style={{
              whiteSpace: 'nowrap',
              color:
                p.batteryPercent !== null && p.batteryPercent >= p.batteryLimit
                  ? 'var(--live)'
                  : 'var(--muted)',
            }}
          >
            {p.batteryPercent === null ? NOT_YET : `${p.batteryPercent}%`}
          </div>
        </div>

        <p className="body" style={{ marginTop: 8 }}>
          {p.batteryPercent === null
            ? // Said plainly rather than guessed at. Chrome removed the Battery
              // Status API from desktop Firefox and Safari entirely, and a
              // charge limit with no battery reading behind it would be a
              // control that silently does nothing.
              'This browser will not report a battery level, so this app cannot tell the socket when to stop. The socket still cuts on its own.'
            : "The socket can't measure a phone — the current is too small. This tells it directly."}
        </p>

        <div style={{ height: 16 }} />

        {/* Dragging is local; the value is committed when the finger lifts.
            Sending on every frame would fire a Bluetooth write per pixel. */}
        <div className="body" style={{ color: p.appManaging ? 'var(--gold)' : 'var(--muted)' }}>
          Stop at {shown}%
        </div>

        <input
          className="slider"
          type="range"
          min={50}
          max={100}
          step={5}
          value={shown}
          disabled={!p.appManaging || p.batteryPercent === null}
          style={{ ['--fill' as string]: `${((shown - 50) / 50) * 100}%` }}
          onChange={(e) => setDragging(Number(e.target.value))}
          onPointerUp={() => {
            if (dragging !== null) p.onBatteryLimit(dragging)
            setDragging(null)
          }}
          onKeyUp={() => {
            if (dragging !== null) p.onBatteryLimit(dragging)
            setDragging(null)
          }}
        />

        <div className="row">
          <span className="label">50%</span>
          <span className="label">100%</span>
        </div>

        <div style={{ height: 12 }} />

        {/* Switching this off tells the socket to go back to deciding for
            itself, which is the only sensible thing for it to do when nobody is
            managing it - not to sit there doing nothing. */}
        <OutlineButton
          full
          tint={p.appManaging ? 'var(--muted)' : 'var(--gold)'}
          disabled={p.batteryPercent === null}
          onClick={() => p.onAppManaging(!p.appManaging)}
        >
          {p.appManaging ? 'Let the socket decide' : 'Let this app manage charging'}
        </OutlineButton>
      </Panel>

      <Panel>
        <div className="row">
          <FieldLabel>Lifetime</FieldLabel>
          <OutlineButton dense tint="var(--gold)" onClick={p.onHistory}>
            History
          </OutlineButton>
        </div>
        <div style={{ height: 16 }} />
        <div className="stats">
          <Stat label="Cutoffs" value={String(p.status.cutoffCount)} />
          <Stat label="Energy saved" value={energySaved(heaviest.current, p.status.totalSavedMs)} />
          <Stat
            label="Peak"
            value={p.status.peakMa > 0 ? `${amps(p.status.peakMa).toFixed(2)} A` : NOT_YET}
          />
        </div>
      </Panel>
        </div>
      </div>

      {confirmDisconnect && (
        <Dialog
          title="Disconnect?"
          body={
            'The socket keeps cutting power on its own. This app stops watching this ' +
            "device's battery, so it will no longer tell the socket when to stop " +
            'charging it.'
          }
          confirmText="DISCONNECT"
          cancelText="CANCEL"
          danger
          onConfirm={() => {
            setConfirmDisconnect(false)
            p.onDisconnect()
          }}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
    </>
  )
}

/**
 * Where the current sits between the cutoff threshold and the session peak.
 *
 * The one thing worth drawing: the whole product is "watch this fall past that
 * line", and a number alone does not show how close it is.
 */
function TaperBar({ status }: { status: SocketStatus }) {
  const span = Math.max(1, status.peakMa - status.thresholdMa)
  const above = Math.max(0, status.currentMa - status.thresholdMa)
  const fraction = Math.min(1, Math.max(0, above / span))

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--surface3)' }}>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            width: `${fraction * 100}%`,
            background: fraction < 0.15 ? 'var(--caution)' : 'var(--live)',
            transition: 'width 600ms ease, background 600ms ease',
          }}
        />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="label">cuts below {amps(status.thresholdMa).toFixed(2)} A</span>
        <span className="label">peak {amps(status.peakMa).toFixed(2)} A</span>
      </div>
    </div>
  )
}
