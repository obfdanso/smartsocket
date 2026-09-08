/**
 * Recognises the socket's radio among everything else on the air.
 *
 * Matching on the name is a heuristic, not proof - the only certainty is
 * opening a link and seeing whether anything answers - but it is right often
 * enough to put the socket where it belongs.
 *
 * Wider than "HC-05" on purpose: the part in this project is an HM-10 class
 * board sold under the HC-05 name, and its siblings are the same CC2541 design
 * wearing different labels.
 */
const MARKERS = [
  'hc-05', 'hc05',
  'hc-06', 'hc06',
  'hm-10', 'hm10',
  'bt05', 'bt-05',
  'at-09', 'at09',
  'jdy',
  'mlt-bt',
  'smartsocket', 'smart socket', 'smart-socket',
]

export const isLikelySocket = (name: string | null | undefined): boolean => {
  const cleaned = name?.trim().toLowerCase()
  if (!cleaned) return false
  return MARKERS.some((m) => cleaned.includes(m))
}
