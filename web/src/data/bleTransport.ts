import { KNOWN_PROFILES, type BleSerialProfile } from './bleSerialProfile'
import { parseStatus } from './statusParser'
import { UNKNOWN_STATUS, type SocketStatus } from './socketStatus'
import { LinkKind, type LinkState, type SocketDevice, type SocketTransport } from './transport'

/**
 * The link to a Bluetooth Low Energy module, over Web Bluetooth.
 *
 * WHY THIS CAN WORK AT ALL. "Bluetooth" is two incompatible radios. Browsers
 * speak GATT and nothing else - there is no Web Bluetooth equivalent of Classic
 * SPP, so a genuine HC-05 could never be reached from a page. The module in
 * this project is an HM-10 wearing the HC-05 name, which is BLE, which is the
 * half a browser can talk to.
 *
 * THE BROWSER OWNS THE DEVICE PICKER. `requestDevice` shows Chrome's own
 * chooser, and a page may not enumerate or scan on its own - a deliberate
 * privacy boundary, since any site could otherwise inventory the radios around
 * you. So the phone's "Devices found (41)" list has no counterpart here: the
 * user picks from the browser's list and the page is handed exactly one device.
 *
 * Which characteristics carry the bytes is worked out from the same profile
 * table the other two clients use.
 */
const HANDSHAKE_TIMEOUT_MS = 10_000
const MAX_LINE_LENGTH = 128

export const bluetoothSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'bluetooth' in navigator

export class BleTransport implements SocketTransport {
  private statusFn: (s: SocketStatus) => void = () => {}
  private linkFn: (s: LinkState) => void = () => {}

  private device: BluetoothDevice | null = null
  private notify: BluetoothRemoteGATTCharacteristic | null = null
  private write: BluetoothRemoteGATTCharacteristic | null = null

  private line = ''
  private closing = false

  /**
   * Two separate facts, and the difference between them is the whole diagnosis.
   * Bytes with no status line means the link is fine and the two ends disagree
   * about the module's baud rate; no bytes at all means nothing is reaching the
   * module from the Arduino, which is a wire.
   */
  private sawBytes = false
  private sawStatus = false

  /** Which profile matched, once a link is up. Names the module in the UI. */
  profileName: string | null = null

  onStatus(fn: (s: SocketStatus) => void) {
    this.statusFn = fn
  }

  onLinkState(fn: (s: LinkState) => void) {
    this.linkFn = fn
  }

  /**
   * Opens the browser's chooser and returns what the user picked.
   *
   * `acceptAllDevices` because the module can be renamed by whoever configured
   * it - filtering by name would hide exactly the device that needs finding.
   * The serial services still have to be declared up front, or the page is not
   * allowed to touch them after connecting.
   */
  async choose(): Promise<SocketDevice | null> {
    if (!bluetoothSupported()) return null

    try {
      const picked = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: KNOWN_PROFILES.map((p) => p.service),
      })

      this.device = picked
      return {
        name: picked.name ?? 'Unnamed',
        id: picked.id,
        kind: LinkKind.Ble,
      }
    } catch {
      // The chooser was dismissed, which is a decision and not a failure.
      return null
    }
  }

  async connect(device: SocketDevice): Promise<boolean> {
    this.closing = false
    this.linkFn({ kind: 'connecting' })

    this.sawBytes = false
    this.sawStatus = false
    this.line = ''

    const target = this.device
    if (!target) {
      this.fail(device.name + ' is not a device this browser has been given. Tap Search again.')
      return false
    }

    let server: BluetoothRemoteGATTServer | undefined
    try {
      target.addEventListener('gattserverdisconnected', this.onDropped)
      server = await target.gatt?.connect()
    } catch (e) {
      this.fail('Could not connect to ' + device.name + '. ' + (e as Error).message)
      return false
    }

    if (!server) {
      this.fail('Could not connect to ' + device.name + '. Is the socket powered and in range?')
      return false
    }

    // Resolve the profile against what the device actually offers, exactly as
    // the phone and the desktop app do.
    let profile: BleSerialProfile | null = null
    let notify: BluetoothRemoteGATTCharacteristic | null = null
    let write: BluetoothRemoteGATTCharacteristic | null = null

    for (const candidate of KNOWN_PROFILES) {
      try {
        const service = await server.getPrimaryService(candidate.service)
        notify = await service.getCharacteristic(candidate.notify)
        write = await service.getCharacteristic(candidate.write)
        profile = candidate
        break
      } catch {
        // Not this design. Try the next.
        notify = null
        write = null
      }
    }

    if (!profile || !notify || !write) {
      this.disconnect()
      this.fail(
        device.name +
          ' is a Bluetooth LE device with no serial channel — nothing on it can ' +
          "carry the socket's data.",
      )
      return false
    }

    this.profileName = profile.name
    this.notify = notify
    this.write = write

    // Subscribing is what makes the module start pushing bytes up. Without it
    // the link is open and permanently silent.
    try {
      await notify.startNotifications()
      notify.addEventListener('characteristicvaluechanged', this.onValue)
    } catch {
      this.disconnect()
      this.fail(device.name + ' refused a subscription, so it can never send anything.')
      return false
    }

    // Ask, rather than wait. The socket publishes once a second on its own, but
    // "?" makes it answer immediately, so a good link proves itself fast.
    await this.sendLine('?')

    const deadline = Date.now() + HANDSHAKE_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (this.sawStatus) {
        this.linkFn({ kind: 'connected', device })
        return true
      }
      await new Promise((r) => setTimeout(r, 100))
    }

    // AN OPEN LINK IS NOT A SMART SOCKET. The two failures below have different
    // fixes, so they are reported separately - the same three-way diagnosis the
    // phone and the desktop app give.
    const reason = this.sawBytes
      ? device.name + ' is sending data this app cannot read. The firmware uses 9600.'
      : device.name +
        ' connected but never sent anything. Check the socket is powered, and ' +
        "that the module's TXD reaches Arduino pin 0."

    this.disconnect()
    this.fail(reason)
    return false
  }

  async send(command: string): Promise<void> {
    return this.sendLine(command)
  }

  async sendLine(line: string): Promise<void> {
    const target = this.write
    if (!target) return

    const bytes = new TextEncoder().encode(line + '\n')

    try {
      // Without a response where the module allows it: these parts are slow to
      // acknowledge and a two-byte command does not need one.
      if (target.properties.writeWithoutResponse) {
        await target.writeValueWithoutResponse(bytes)
      } else {
        await target.writeValueWithResponse(bytes)
      }
    } catch {
      // A write to a device that has just gone out of range throws. The
      // disconnect handler reports that once.
    }
  }

  disconnect(): void {
    this.closing = true

    const n = this.notify
    this.notify = null
    this.write = null

    if (n) {
      n.removeEventListener('characteristicvaluechanged', this.onValue)
      n.stopNotifications().catch(() => {})
    }

    const d = this.device
    if (d) {
      d.removeEventListener('gattserverdisconnected', this.onDropped)
      try {
        d.gatt?.disconnect()
      } catch {
        // Already gone.
      }
    }

    this.line = ''
    this.statusFn(UNKNOWN_STATUS)
    this.linkFn({ kind: 'idle' })
  }

  private onDropped = () => {
    if (this.closing) return
    this.fail('The link to the socket dropped.')
  }

  private onValue = (event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (!value || value.byteLength === 0) return

    this.sawBytes = true

    for (let i = 0; i < value.byteLength; i++) {
      const c = String.fromCharCode(value.getUint8(i))
      if (c === '\r') continue

      if (c !== '\n') {
        // BLE delivers 20-byte packets, so a status line always arrives in
        // pieces and has to be reassembled. The cap stops a module that never
        // sends a newline from growing the buffer without bound.
        if (this.line.length < MAX_LINE_LENGTH) this.line += c
        continue
      }

      const complete = this.line
      this.line = ''

      const parsed = parseStatus(complete)
      if (parsed) {
        this.sawStatus = true
        this.statusFn(parsed)
      }
    }
  }

  private fail(reason: string) {
    this.linkFn({ kind: 'failed', reason })
  }
}
