package gh.group38.smartsocket.data

/**
 * Puts the socket at the top of the picker.
 *
 * THE ONE DEVICE THE USER OPENED THE APP FOR USED TO SIT SIXTEENTH. The list was
 * built as bonded-devices-then-scan-results, and a BLE serial module never
 * bonds - it can only be found by scanning - so it landed underneath every pair
 * of headphones the phone had ever been paired with.
 *
 * Ranked by how much each piece of evidence is worth:
 *
 *  1. **It advertises a serial service.** Nothing else in the room does. A phone
 *     or a pair of earbuds has no reason to offer `FFE0`; a serial module exists
 *     for nothing else.
 *  2. **It is named like a serial module.** Weaker, because a name can be
 *     changed over AT commands - this project's part is an HM-10 calling itself
 *     HC-05 - but right far more often than not.
 *  3. **It is loud.** Among equals the socket is the thing on the desk in front
 *     of you, so it is reliably the closest.
 *
 * Bonded devices carry no signal reading at all, so they sink to the bottom of
 * the last tier, which is where a pair of headphones belongs.
 *
 * Pure Kotlin with no Android in it, so the ordering can be tested on the JVM
 * rather than by carrying a socket around - the same split that lets the wire
 * format and the reconnect schedule be tested.
 */
object DeviceRanking {

    /** Most likely to be the socket first. Stable, so equal devices keep their order. */
    fun rank(devices: List<SocketDevice>): List<SocketDevice> = devices.sortedWith(
        compareByDescending<SocketDevice> { it.advertisesSerial }
            .thenByDescending { SocketNaming.isLikelySocket(it.name) }
            .thenByDescending { it.rssi ?: Int.MIN_VALUE }
    )
}
