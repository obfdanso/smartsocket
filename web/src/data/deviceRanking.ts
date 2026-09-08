import { isLikelySocket } from './socketNaming'
import type { SocketDevice } from './transport'

/**
 * Puts the socket at the top of the picker, ranked by how much each piece of
 * evidence is worth:
 *
 *  1. It advertises a serial service. Nothing else in the room does.
 *  2. It is named like a serial module. Renameable, so weaker.
 *  3. It is loud - among equals the socket is the one on the desk.
 *
 * Ported from the Android app, where the same ordering is covered by six tests.
 */
export function rankDevices(devices: SocketDevice[]): SocketDevice[] {
  const score = (d: SocketDevice): [number, number, number] => [
    d.advertisesSerial ? 1 : 0,
    isLikelySocket(d.name) ? 1 : 0,
    d.rssi ?? Number.NEGATIVE_INFINITY,
  ]

  // Index carried through so equal devices keep their order - Array.sort is
  // stable in modern engines, but saying so costs nothing.
  return devices
    .map((d, i) => ({ d, i, s: score(d) }))
    .sort((a, b) => b.s[0] - a.s[0] || b.s[1] - a.s[1] || b.s[2] - a.s[2] || a.i - b.i)
    .map((x) => x.d)
}
