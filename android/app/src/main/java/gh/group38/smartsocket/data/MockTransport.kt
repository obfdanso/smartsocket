package gh.group38.smartsocket.data

import kotlin.math.exp
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * A socket that exists only in software.
 *
 * Not a stub returning canned values - it runs the same sequence the real
 * firmware does, in real time: settle, charge, taper, cut. That makes every
 * screen developable and demonstrable with no module in the room.
 *
 * **It runs once and stops.** It used to loop every thirty seconds, which meant
 * a charge completed, the wall was cut, and moments later the whole thing
 * started again from nothing - so anyone watching for more than a minute saw the
 * socket apparently cutting power over and over, and the lifetime counters
 * climbing to numbers no real socket would reach in a day. One charge, watched
 * to its end, is what the product actually does.
 *
 * Timings are chosen so a full run lasts about half an hour. Nothing here is a
 * claim about the real device's timing; `Config.h` is the authority on that.
 */
class MockTransport(private val scope: CoroutineScope) : SocketTransport {

    private val _linkState = MutableStateFlow<LinkState>(LinkState.Idle)
    override val linkState: Flow<LinkState> = _linkState.asStateFlow()

    private val _status = MutableStateFlow(SocketStatus.UNKNOWN)
    override val status: Flow<SocketStatus> = _status.asStateFlow()

    private var script: Job? = null

    /**
     * Carried across restarts rather than held inside the script, so a re-arm
     * continues the socket's life instead of resetting its totals.
     */
    private var cutoffs = 0
    private var savedMs = 0L

    override suspend fun connect(device: SocketDevice): Boolean {
        _linkState.value = LinkState.Connecting
        delay(700)
        _linkState.value = LinkState.Connected(device)

        cutoffs = 0
        savedMs = 0L
        restart(fromCharging = false)
        return true
    }

    /**
     * Accepted and ignored. The demo has no display to update and no charge
     * policy to hand over, so `A`, `B`, `T` and `L` lines have nothing to do.
     */
    override suspend fun sendLine(line: String) = Unit

    /**
     * THE BUTTONS TAKE THE SOCKET OVER, and the script lets go.
     *
     * They used to set a state that the script overwrote on its next tick a
     * fraction of a second later, so "Cut power" flickered and then carried on
     * charging - the one control anybody demonstrating this app is certain to
     * press, doing visibly nothing. A command now stops the script, exactly as a
     * command to the real socket overrides what it was going to do.
     */
    override suspend fun send(command: SocketCommand) {
        val now = _status.value

        when (command) {
            SocketCommand.CUT ->
                if (now.state.isPowerOn) {
                    stopScript()
                    // Counted, because it is a real cutoff: the lifetime total
                    // has to match what the person watching just saw happen.
                    cutoffs += 1
                    _status.value = now.copy(
                        state = SocketState.CUTOFF,
                        currentMa = 0,
                        peakMa = 0,
                        relayClosed = false,
                        cutoffCount = cutoffs,
                    )
                }

            SocketCommand.REARM ->
                if (now.state == SocketState.CUTOFF || now.state.isAlarm) {
                    _status.value = now.copy(state = SocketState.READY, relayClosed = true)
                    // Straight back to charging. Sitting through another minute
                    // of "waiting for something to be plugged in" is not what
                    // someone who just pressed Re-arm is asking for.
                    restart(fromCharging = true)
                }

            SocketCommand.PROBE ->
                if (now.state == SocketState.CUTOFF) {
                    _status.value = now.copy(state = SocketState.PROBING, relayClosed = true)
                    restart(fromCharging = true)
                }

            SocketCommand.STATUS_NOW -> Unit

            SocketCommand.RESET_TOTALS -> {
                cutoffs = 0
                savedMs = 0L
                _status.value = now.copy(cutoffCount = 0, totalSavedMs = 0)
            }
        }
    }

    override fun disconnect() {
        stopScript()
        cutoffs = 0
        savedMs = 0L
        _linkState.value = LinkState.Idle
        _status.value = SocketStatus.UNKNOWN
    }

    private fun stopScript() {
        script?.cancel()
        script = null
    }

    private fun restart(fromCharging: Boolean) {
        stopScript()
        script = scope.launch { run(fromCharging) }
    }

    /**
     * One charge, start to finish, then it stays cut.
     *
     * Deliberately no probe-and-resume at the end. Probing is what leads back
     * into charging, and a demo that returns to the beginning on its own is the
     * looping this was written to stop.
     */
    private suspend fun run(fromCharging: Boolean) {
        if (!fromCharging) {
            repeat(ReadySeconds) {
                emit(SocketState.READY, currentMa = 0, relayClosed = true)
                delay(TickMs)
            }
        }

        repeat(SettlingSeconds) {
            emit(SocketState.SETTLING, currentMa = PlateauMa + 5, relayClosed = true)
            delay(TickMs)
        }

        var peak = 0
        for (second in 0 until ChargingSeconds) {
            val ma = chargeCurrentMa(second)
            if (ma > peak) peak = ma

            emit(
                state = SocketState.CHARGING,
                currentMa = ma,
                peakMa = peak,
                thresholdMa = ThresholdMa,
                elapsedMs = second * 1_000L,
                relayClosed = true,
            )
            delay(TickMs)
        }

        cutoffs += 1
        emit(SocketState.CUTOFF, currentMa = 0, relayClosed = false)

        // Sit cut, accumulating the time the wall was off, and then simply stop.
        // The buttons still work: the socket is left where a real one would be,
        // waiting for someone to re-arm it.
        repeat(CutoffSeconds) {
            savedMs += TickMs
            emit(SocketState.CUTOFF, currentMa = 0, relayClosed = false)
            delay(TickMs)
        }
    }

    /**
     * A charger's current over time: a long plateau, a knee, then a decaying
     * tail toward the trickle.
     *
     * Exponential rather than linear because that is the shape the real thing
     * makes - the fall is steep at the knee and flattens out, which is exactly
     * why the firmware needs a confirmation window rather than a single reading
     * below the threshold.
     */
    private fun chargeCurrentMa(second: Int): Int {
        val t = second.toFloat() / ChargingSeconds

        if (t < KneeAt) {
            // Not flat: a real reading jitters by a count or two, and a
            // perfectly constant number looks like a frozen screen.
            return PlateauMa + ((second % 7) - 3)
        }

        val k = (t - KneeAt) / (1f - KneeAt)
        val span = (PlateauMa - TrickleMa).toFloat()
        return (TrickleMa + span * exp(-3f * k)).roundToInt()
    }

    private fun emit(
        state: SocketState,
        currentMa: Int,
        peakMa: Int = 0,
        thresholdMa: Int = 0,
        elapsedMs: Long = 0,
        relayClosed: Boolean,
    ) {
        _status.value = SocketStatus(
            state = state,
            currentMa = currentMa,
            peakMa = peakMa,
            thresholdMa = thresholdMa,
            sessionElapsedMs = elapsedMs,
            cutoffCount = cutoffs,
            totalSavedMs = savedMs,
            relayClosed = relayClosed,
        )
    }

    companion object {
        val DEVICE = SocketDevice(
            name = "Demo socket",
            address = "00:00:00:00:00:00",
            kind = LinkKind.DEMO,
        )

        /** Once a second, which is what the firmware's telemetry does. */
        private const val TickMs = 1_000L

        // About half an hour end to end: 1 + 1 + 23 + 4 minutes.
        private const val ReadySeconds = 60
        private const val SettlingSeconds = 60
        private const val ChargingSeconds = 1_400
        private const val CutoffSeconds = 240

        /** Where the plateau ends and the taper begins, as a fraction of the charge. */
        private const val KneeAt = 0.55f

        private const val PlateauMa = 150
        private const val TrickleMa = 66
        private const val ThresholdMa = 100
    }
}
