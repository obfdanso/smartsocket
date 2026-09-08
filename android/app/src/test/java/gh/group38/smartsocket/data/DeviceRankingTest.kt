package gh.group38.smartsocket.data

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The picker's ordering, proved without a radio.
 *
 * This is the behaviour the demo turns on: if the socket is not near the top of
 * a list of forty devices, nobody finds it. Testing it here rather than by
 * carrying the module around is the whole reason [DeviceRanking] has no Android
 * in it.
 */
class DeviceRankingTest {

    private fun device(
        name: String,
        rssi: Int? = null,
        serial: Boolean = false,
    ) = SocketDevice(
        name = name,
        address = name,
        kind = LinkKind.BLE,
        rssi = rssi,
        advertisesSerial = serial,
    )

    private fun order(vararg devices: SocketDevice) =
        DeviceRanking.rank(devices.toList()).map { it.name }

    @Test
    fun `a serial advertisement beats everything else`() {
        // Deliberately the worst on every other measure: nameless, and the
        // faintest signal in the list. The service it offers still wins.
        val order = order(
            device("Loud earbuds", rssi = -35),
            device("HC-05 lookalike", rssi = -40),
            device("Unnamed", rssi = -95, serial = true),
        )

        assertEquals("Unnamed", order.first())
    }

    @Test
    fun `a socket-shaped name beats a stronger signal`() {
        val order = order(
            device("Portia's AirPods Pro", rssi = -30),
            device("BT05", rssi = -88),
        )

        assertEquals("BT05", order.first())
    }

    /** The module is an HM-10 sold as an HC-05, so both names have to count. */
    @Test
    fun `every catalogued module name is recognised`() {
        listOf("HC-05", "hc05", "HM-10", "BT05", "AT-09", "JDY-08", "MLT-BT05")
            .forEach { name ->
                val order = order(device("Somebody's phone", rssi = -20), device(name))
                assertEquals("$name should outrank a louder stranger", name, order.first())
            }
    }

    @Test
    fun `among equals the closest comes first`() {
        val order = order(
            device("Far", rssi = -90),
            device("Very close", rssi = -40),
            device("Nearby", rssi = -65),
        )

        assertEquals(listOf("Very close", "Nearby", "Far"), order)
    }

    /**
     * The regression this ranking was written for.
     *
     * Bonded devices carry no signal reading. Listed as a block ahead of the
     * scan results - which is how the picker used to build its list - they put
     * the socket below every pair of headphones the phone had ever been paired
     * with.
     */
    @Test
    fun `bonded devices sink below anything actually seen on the air`() {
        val order = order(
            device("Bonded earbuds"),
            device("Bonded speaker"),
            device("Faint stranger", rssi = -99),
        )

        assertEquals("Faint stranger", order.first())
    }

    @Test
    fun `ordering is stable for devices with nothing to separate them`() {
        val order = order(
            device("First"),
            device("Second"),
            device("Third"),
        )

        assertEquals(listOf("First", "Second", "Third"), order)
    }
}
