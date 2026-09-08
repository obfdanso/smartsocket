/**
 * Which characteristic carries bytes each way on a BLE serial module.
 *
 * BLE has no equivalent of Classic Bluetooth's SPP. Every vendor bolted a
 * serial channel onto GATT with private UUIDs, so a module advertising itself
 * as "HC-05" may be any of half a dozen designs.
 *
 * **The module in this project is an HM-10 / FFE0**, not the HC-05 it is sold
 * as. Kept identical to the Kotlin and C# tables on purpose: a module that
 * works on one client has to work on the others.
 */
export interface BleSerialProfile {
  service: string
  notify: string
  write: string
  name: string
}

const short = (id: number): string =>
  `0000${id.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`

/** The catalogued designs, most common first. */
export const KNOWN_PROFILES: BleSerialProfile[] = [
  // HM-10 / AT-09 / JDY / CC2541. One characteristic, both directions.
  { service: short(0xffe0), notify: short(0xffe1), write: short(0xffe1), name: 'HM-10 / FFE0' },

  // Nordic UART. Note the crossover: 0003 is the device's TX, so it is the
  // host's notify, and 0002 is what the host writes.
  {
    service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    notify: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    write: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    name: 'Nordic UART',
  },

  // Microchip RN4870 / RN4871 transparent UART.
  {
    service: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    notify: '49535343-1e4d-4bd9-ba61-23c647249616',
    write: '49535343-8841-43f4-a8d4-ecbe34729bb3',
    name: 'Microchip transparent UART',
  },

  // Feasycom and several other FFF0-range modules, split characteristics.
  { service: short(0xfff0), notify: short(0xfff1), write: short(0xfff2), name: 'FFF0 split' },
]
