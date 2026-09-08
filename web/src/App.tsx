import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BleTransport, bluetoothSupported } from './data/bleTransport'
import { MockTransport } from './data/mockTransport'
import {
  SocketCommand,
  SocketState,
  UNKNOWN_STATUS,
  type SocketStatus,
} from './data/socketStatus'
import {
  DEMO_DEVICE,
  LinkKind,
  type LinkState,
  type SocketDevice,
  type SocketTransport,
} from './data/transport'
import {
  clearHistory,
  downloadCsv,
  loadHistory,
  recordSession,
  type ChargeSession,
} from './data/history'
import { ConnectScreen, ConnectingScreen } from './ui/ConnectScreen'
import { DashboardScreen } from './ui/DashboardScreen'
import { HistoryScreen } from './ui/HistoryScreen'
import { OnboardingScreen } from './ui/OnboardingScreen'
import { SplashScreen } from './ui/SplashScreen'
import { Dialog } from './ui/components'

type Screen = 'splash' | 'onboarding' | 'connect' | 'connecting' | 'dashboard' | 'history'

const ONBOARDED_KEY = 'smartsocket.onboarded'
const LIMIT_KEY = 'smartsocket.limit'
const MANAGING_KEY = 'smartsocket.managing'

/** Ten points below the limit, so it does not oscillate. */
const RESUME_GAP = 10

/**
 * Watches the battery this page is running on.
 *
 * THE BATTERY STATUS API IS NOT UNIVERSAL. Chrome and Edge implement it;
 * Firefox and Safari removed it deliberately, on fingerprinting grounds. Where
 * it is missing the charge limit cannot work at all, so the UI says so plainly
 * rather than offering a control that silently does nothing.
 */
function useBattery() {
  const [percent, setPercent] = useState<number | null>(null)
  const [charging, setCharging] = useState(false)

  useEffect(() => {
    const anyNav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number
        charging: boolean
        addEventListener: (t: string, f: () => void) => void
        removeEventListener: (t: string, f: () => void) => void
      }>
    }

    if (!anyNav.getBattery) return
    let battery: Awaited<ReturnType<NonNullable<typeof anyNav.getBattery>>> | null = null

    const read = () => {
      if (!battery) return
      setPercent(Math.round(battery.level * 100))
      setCharging(battery.charging)
    }

    anyNav.getBattery().then((b) => {
      battery = b
      read()
      b.addEventListener('levelchange', read)
      b.addEventListener('chargingchange', read)
    })

    return () => {
      battery?.removeEventListener('levelchange', read)
      battery?.removeEventListener('chargingchange', read)
    }
  }, [])

  return { percent, charging }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash')
  const [status, setStatus] = useState<SocketStatus>(UNKNOWN_STATUS)
  const [link, setLink] = useState<LinkState>({ kind: 'idle' })
  const [device, setDevice] = useState<SocketDevice | null>(null)
  const [history, setHistory] = useState<ChargeSession[]>(() => loadHistory())
  const [searching, setSearching] = useState(false)

  const [limit, setLimit] = useState(() => Number(localStorage.getItem(LIMIT_KEY) ?? 90))
  const [managing, setManaging] = useState(() => localStorage.getItem(MANAGING_KEY) === '1')

  const { percent, charging } = useBattery()

  /**
   * Whether a failure is currently worth a dialog - true only once the user has
   * actually asked for a connection.
   *
   * Held here rather than inside the connect screen: choosing a device swaps
   * that screen out, so anything remembered down there is gone by the time the
   * failure arrives.
   */
  const [connectRequested, setConnectRequested] = useState(false)

  const ble = useMemo(() => new BleTransport(), [])
  const mock = useMemo(() => new MockTransport(), [])
  const active = useRef<SocketTransport | null>(null)

  // --- session tracking, the one place that watches for transitions ---------
  const sessionPeak = useRef(0)
  const sessionStart = useRef(0)
  const previousState = useRef<SocketState | null>(null)
  const lastCutoffCount = useRef(-1)

  const onStatus = useCallback((s: SocketStatus) => {
    setStatus(s)

    if (s.peakMa > sessionPeak.current) sessionPeak.current = s.peakMa
    if (s.state === SocketState.Settling && previousState.current !== SocketState.Settling) {
      sessionPeak.current = 0
      sessionStart.current = Date.now()
    }

    // A cutoff the socket decided for itself while nobody was connected. Its
    // counter only moves on a real one, so a jump is evidence even though the
    // transition itself was never seen.
    const missed = lastCutoffCount.current >= 0 && s.cutoffCount > lastCutoffCount.current
    lastCutoffCount.current = s.cutoffCount

    const was = previousState.current
    previousState.current = s.state
    const entered = was !== null && was !== s.state && s.state === SocketState.Cutoff

    // Either signal records once, never twice: a cutoff seen live moves the
    // counter in the same status line that carries the transition.
    if (entered || missed) {
      setHistory(
        recordSession({
          endedAtMillis: Date.now(),
          peakMa: sessionPeak.current,
          cutAtMa: s.currentMa,
          durationMs: sessionStart.current > 0 ? Date.now() - sessionStart.current : 0,
        }),
      )

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Power cut', {
          body: 'Charging finished and the wall is off.',
          icon: '/logo_mark.png',
        })
      }

      sessionPeak.current = 0
      sessionStart.current = 0
    }
  }, [])

  const onLink = useCallback((s: LinkState) => {
    setLink(s)
    if (s.kind === 'connected') {
      setConnectRequested(false)
      setScreen('dashboard')
      // A history entry pushed so the browser's back gesture reaches the
      // dashboard's own handler instead of leaving the page.
      history_pushOnce()
    } else if (s.kind === 'connecting') {
      setScreen('connecting')
    } else if (s.kind !== 'reconnecting') {
      setScreen((current) =>
        current === 'dashboard' || current === 'connecting' ? 'connect' : current,
      )
    }
  }, [])

  useEffect(() => {
    ble.onStatus(onStatus)
    ble.onLinkState(onLink)
    mock.onStatus(onStatus)
    mock.onLinkState(onLink)
  }, [ble, mock, onStatus, onLink])

  // --- the charge limit ----------------------------------------------------

  /**
   * Tells the socket what this device's battery is doing.
   *
   * The socket cannot work it out: a phone charging on 230 V draws about 20 mA,
   * below one ADC count on the ACS712-5A, so its sensor reads a true zero and
   * it concludes the outlet is empty. The client knows better, so it says so.
   */
  useEffect(() => {
    const t = active.current
    if (!t || link.kind !== 'connected' || percent === null) return

    void t.sendLine(managing ? 'A1' : 'A0')
    void t.sendLine(`B${percent}`)
    void t.sendLine(`T${limit}`)
    void t.sendLine(charging ? 'L1' : 'L0')

    if (!managing) return

    // Whichever condition is met first cuts, and the firmware ignores a command
    // for a state it is already in.
    if (percent >= limit && status.state !== SocketState.Cutoff) {
      void t.send(SocketCommand.Cut)
    } else if (percent <= limit - RESUME_GAP && status.state === SocketState.Cutoff) {
      void t.send(SocketCommand.Rearm)
    }
  }, [percent, charging, managing, limit, link.kind, status.state])

  // --- actions -------------------------------------------------------------

  const connectTo = async (target: SocketDevice, transport: SocketTransport) => {
    active.current = transport
    setDevice(target)
    previousState.current = null
    lastCutoffCount.current = -1
    await transport.connect(target)
  }

  const onSearch = async () => {
    setSearching(true)
    try {
      const picked = await ble.choose()
      if (!picked) return
      setConnectRequested(true)
      await connectTo(picked, ble)
    } finally {
      setSearching(false)
    }
  }

  const onDemo = async () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
    await connectTo(DEMO_DEVICE, mock)
  }

  const onDisconnect = () => {
    // Give the socket its own judgement back before dropping the link, so it is
    // never left with nothing watching the charge.
    void active.current?.sendLine('A0')
    active.current?.disconnect()
    active.current = null
    setDevice(null)
    setScreen('connect')
  }

  const send = (c: string) => void active.current?.send(c)

  const onClearHistory = () => {
    clearHistory()
    setHistory([])
    // The lifetime totals live in the socket's EEPROM, not here, which is why
    // clearing only this list left them on screen looking stuck.
    void active.current?.send(SocketCommand.ResetTotals)
  }

  // --- render --------------------------------------------------------------

  if (screen === 'splash') {
    return (
      <div className="app">
        <SplashScreen
          onDone={() =>
            setScreen(localStorage.getItem(ONBOARDED_KEY) === '1' ? 'connect' : 'onboarding')
          }
        />
      </div>
    )
  }

  if (screen === 'onboarding') {
    return (
      <div className="app">
        <OnboardingScreen
          onDone={() => {
            localStorage.setItem(ONBOARDED_KEY, '1')
            setScreen('connect')
          }}
        />
      </div>
    )
  }

  if (screen === 'connecting') {
    return (
      <div className="app">
        <ConnectingScreen name={device?.name ?? 'Smart Socket'} />
      </div>
    )
  }

  if (screen === 'history') {
    return (
      <div className="app app--wide">
        <HistoryScreen
          sessions={history}
          onBack={() => setScreen(link.kind === 'connected' ? 'dashboard' : 'connect')}
          onClear={onClearHistory}
          onExport={() => downloadCsv(history)}
        />
      </div>
    )
  }

  if (screen === 'dashboard') {
    return (
      <div className="app app--wide">
        <DashboardScreen
          status={status}
          link={link}
          deviceName={device?.name ?? 'Smart Socket'}
          isDemo={device?.kind === LinkKind.Demo}
          batteryPercent={percent}
          batteryLimit={limit}
          resumeAt={Math.max(5, limit - RESUME_GAP)}
          appManaging={managing}
          charging={charging}
          onCommand={send}
          onBatteryLimit={(n) => {
            setLimit(n)
            localStorage.setItem(LIMIT_KEY, String(n))
          }}
          onAppManaging={(on) => {
            setManaging(on)
            localStorage.setItem(MANAGING_KEY, on ? '1' : '0')
          }}
          onDisconnect={onDisconnect}
          onHistory={() => setScreen('history')}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <ConnectScreen
        supported={bluetoothSupported()}
        searching={searching}
        onSearch={onSearch}
        onDemo={onDemo}
      />

      {/*
        A FAILURE IS ONLY WORTH A DIALOG IF THE USER ASKED FOR THE CONNECTION.
        Anything that reconnects on its own must not interrupt with a box about
        an attempt nobody made.
      */}
      {link.kind === 'failed' && connectRequested && (
        <Dialog
          title="Device not in range"
          body={link.reason}
          confirmText="OK"
          danger
          onConfirm={() => setConnectRequested(false)}
          onCancel={() => setConnectRequested(false)}
        />
      )}
    </div>
  )
}

/** Pushes one history entry, so the back gesture has something to pop. */
let pushed = false
function history_pushOnce() {
  if (pushed) return
  pushed = true
  window.history.pushState({ app: true }, '')
}
