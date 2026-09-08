package gh.group38.smartsocket.data

/**
 * Recognises the socket's radio among everything else on the air.
 *
 * A sweep in a building returns dozens of devices and exactly one of them is the
 * socket. Matching on the name is a heuristic, not proof - the only certainty is
 * opening a link and seeing whether anything answers - but it is right often
 * enough to put the socket where it belongs and push the earbuds out of the way.
 *
 * **Weaker evidence than the advertised service UUID**, which is why callers try
 * that first. A module can be renamed over AT commands; it cannot lie about the
 * GATT service it offers.
 *
 * Pure Kotlin with no Android in it, so it is testable on the JVM - the same
 * split that lets the wire format and the reconnect schedule be tested.
 */
object SocketNaming {

    /**
     * The names these modules ship with, and the ones somebody would rename them
     * to.
     *
     * Wider than "HC-05" on purpose. The part in this project is an HM-10 class
     * board sold under the HC-05 name, and its siblings - AT-09, BT05, JDY-08,
     * MLT-BT05 - are the same CC2541 design wearing different labels. Whichever
     * one is in the box, it should float to the top.
     */
    private val MARKERS = listOf(
        "hc-05", "hc05",
        "hc-06", "hc06",
        "hm-10", "hm10",
        "bt05", "bt-05",
        "at-09", "at09",
        "jdy",
        "mlt-bt",
        "smartsocket", "smart socket", "smart-socket",
    )

    fun isLikelySocket(name: String?): Boolean {
        val cleaned = name?.trim()?.lowercase() ?: return false
        if (cleaned.isEmpty()) return false
        return MARKERS.any { cleaned.contains(it) }
    }
}
