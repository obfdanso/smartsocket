import type { SocketStatus } from './socketStatus'

/**
 * How the bytes get there.
 *
 * Only two on the web, where the phone has three. There is no Web Bluetooth
 * equivalent of Classic SPP - browsers speak GATT and nothing else - so a real
 * HC-05 could never be reached from a page. The module in this project is BLE,
 * which is the half that works.
 */
export enum LinkKind {
  Ble = 'BLE',
  Demo = 'DEMO',
}

/** A socket you can connect to. */
export interface SocketDevice {
  name: string
  id: string
  kind: LinkKind
  /** Whether the advertisement named a serial service. */
  advertisesSerial?: boolean
  /** Signal strength, when the platform will say. Browsers usually will not. */
  rssi?: number | null
}

export const DEMO_DEVICE: SocketDevice = {
  name: 'Demo socket',
  id: 'DEMO',
  kind: LinkKind.Demo,
}

export const isDemo = (d: SocketDevice): boolean => d.kind === LinkKind.Demo

export type LinkState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected'; device: SocketDevice }
  /**
   * The link dropped on its own and is being rebuilt. Distinct from
   * `connecting`, which is a link the user just asked for: a reconnect must not
   * throw the user back to the picker.
   */
  | { kind: 'reconnecting'; device: SocketDevice; attempt: number }
  | { kind: 'failed'; reason: string }

/**
 * The link to a socket.
 *
 * Two implementations for the same reason the firmware has `ICurrentSensor`:
 * the UI must be buildable and demonstrable with no hardware in the room.
 */
export interface SocketTransport {
  connect(device: SocketDevice): Promise<boolean>
  send(command: string): Promise<void>
  /** One raw line, newline appended by the transport. */
  sendLine(line: string): Promise<void>
  disconnect(): void
  onStatus(fn: (s: SocketStatus) => void): void
  onLinkState(fn: (s: LinkState) => void): void
}
