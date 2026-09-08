package gh.group38.smartsocket.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import gh.group38.smartsocket.data.LinkState
import gh.group38.smartsocket.data.ReconnectPolicy
import gh.group38.smartsocket.data.SocketCommand
import gh.group38.smartsocket.data.SocketState
import gh.group38.smartsocket.data.SocketStatus
import java.util.Locale
import kotlin.math.roundToInt

// The Slider `track` slot, and SliderDefaults.Track taking a SliderState, are
// still experimental in Material3 1.3. Opted in deliberately: the alternative is
// the stock track, which is the thing being fixed.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    status: SocketStatus,
    linkState: LinkState,
    deviceName: String,
    batteryLimit: Int,
    batteryPercent: Int,
    resumeAt: Int,
    appManaging: Boolean,

    /**
     * Whether Android says this phone is taking a charge. The socket cannot
     * tell - that is the whole premise - so this is the only source of the fact.
     */
    phoneCharging: Boolean,
    onCommand: (SocketCommand) -> Unit,
    onBatteryLimit: (Int) -> Unit,
    onAppManaging: (Boolean) -> Unit,
    onDisconnect: () -> Unit,
    onHistory: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val reconnecting = linkState as? LinkState.Reconnecting
    val tint = status.state.tint()
    val isDemo = (linkState as? LinkState.Connected)?.device?.isDemo == true

    /**
     * The heaviest draw seen since this screen opened.
     *
     * Kept because [SocketStatus.peakMa] is cleared the instant the socket cuts,
     * so reading the live value would blank the power figure at exactly the
     * moment it is worth showing - the one right after the wall went off.
     */
    var heaviestMa by remember { mutableIntStateOf(0) }
    if (status.peakMa > heaviestMa) heaviestMa = status.peakMa

    // DISCONNECTING ASKS FIRST, WHICHEVER WAY IT IS REACHED.
    //
    // It hands the charge decision back to the socket and drops the link. That
    // is a real consequence to arrive at by way of a stray tap near the top of
    // the screen, or a back gesture made out of habit.
    //
    // Back lets go of the socket rather than the app: this is the root screen
    // once a link is up, so back used to fall straight out to the launcher,
    // leaving the link, the foreground service and the battery cutoff all
    // running behind a screen the user thought they had closed. Going back from
    // here means "I am done with this socket" - which is what Disconnect means -
    // so both routes arrive at the same question.
    var confirmingDisconnect by remember { mutableStateOf(false) }

    BackHandler { confirmingDisconnect = true }

    if (confirmingDisconnect) {
        DisconnectDialog(
            onConfirm = {
                confirmingDisconnect = false
                onDisconnect()
            },
            onCancel = { confirmingDisconnect = false },
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Ink)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 22.dp, vertical = 32.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // 40, not 30: the monogram is a drawn mark with a thin inner
                // ring, and below about 40 dp that ring stops resolving.
                LogoMark(size = 40.dp)
                Column(Modifier.padding(start = 12.dp)) {
                    // The simulated socket does not announce itself by name.
                    // "Demo socket" labels a thing that is not there, and next
                    // to a live current reading it invites the reader to
                    // distrust the reading too. A real module keeps its name,
                    // because which socket you are holding is worth knowing.
                    if (!isDemo) {
                        Text(
                            text = deviceName,
                            style = MaterialTheme.typography.titleMedium,
                            color = Bone,
                        )
                    }
                    Text(
                        text = when {
                            reconnecting != null -> "Reconnecting"
                            status.relayClosed -> "Outlet live"
                            else -> "Outlet off"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = when {
                            reconnecting != null -> Gold
                            status.relayClosed -> Caution
                            else -> Muted
                        },
                    )
                }
            }
            // A bordered chip in Alarm, not grey text. It drops the link on a
            // device switching 230 V, which is not something to trip over while
            // reaching for the top of the screen - so it is bigger than it was,
            // and it looks like the consequence it carries.
            OutlineButton(
                text = "DISCONNECT",
                onClick = { confirmingDisconnect = true },
                tint = Alarm,
                dense = true,
            )
        }

        if (reconnecting != null) {
            Spacer(Modifier.height(20.dp))
            ReconnectingBanner(attempt = reconnecting.attempt)
        }

        Spacer(Modifier.height(30.dp))

        // --- the number ------------------------------------------------------
        // THE BIG NUMBER IS WHATEVER IS ACTUALLY WORTH KNOWING.
        //
        // It used to be the current, always. On a phone that is a guaranteed
        // 0.00 A - charging draws about 20 mA, below one ADC count on the
        // ACS712-5A - so the screen's largest, most confident element was a
        // permanent zero, and it read as a fault rather than as a limit of the
        // sensor. When the socket cannot see the load, the battery percentage is
        // the number the user came to the app for.
        val showBatteryInstead = phoneCharging && status.state == SocketState.READY

        Panel(accent = status.state.isAlarm, modifier = Modifier.fillMaxWidth()) {
            StatePill(
                label = if (showBatteryInstead) "CHARGING" else status.state.label,
                tint = tint,
            )
            Spacer(Modifier.height(22.dp))

            if (showBatteryInstead) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        text = "$batteryPercent",
                        style = MaterialTheme.typography.displayLarge,
                        color = Bone,
                    )
                    Text(
                        text = "%",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Light,
                        color = Muted,
                        modifier = Modifier.padding(start = 8.dp, bottom = 12.dp),
                    )
                }
            } else {
                val amps by animateFloatAsState(
                    targetValue = status.amps,
                    animationSpec = tween(600),
                    label = "amps",
                )
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        text = String.format(Locale.UK, "%.2f", amps),
                        style = MaterialTheme.typography.displayLarge,
                        color = Bone,
                    )
                    Text(
                        text = "A",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Light,
                        color = Muted,
                        modifier = Modifier.padding(start = 8.dp, bottom = 12.dp),
                    )
                }
            }

            Spacer(Modifier.height(6.dp))
            Text(
                // "Waiting for something to be plugged in" is what the socket
                // honestly believes, and it is wrong in the one case this app
                // was built for. A phone charging on 230 V draws about 20 mA -
                // below a single ADC count on the ACS712-5A, and below
                // NoiseFloorMa - so the socket reads a true zero and concludes
                // the outlet is empty. The phone knows better, so it says so.
                text = if (showBatteryInstead) {
                    if (appManaging) {
                        "Charging to $batteryLimit%. The socket can't measure a phone, " +
                            "so this app tells it when to stop."
                    } else {
                        "Charging. The socket can't measure a phone — turn on app " +
                            "management below to have it stopped at a percentage."
                    }
                } else {
                    status.state.detail
                },
                style = MaterialTheme.typography.bodyMedium,
                color = Muted,
            )

            if (status.state == SocketState.CHARGING && status.peakMa > 0) {
                Spacer(Modifier.height(22.dp))
                TaperBar(status = status)
            }
        }

        Spacer(Modifier.height(16.dp))

        // --- controls --------------------------------------------------------
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            // Nothing can be commanded down a link that is not there. A button
            // that looks like it worked and did not is worse than a dead one on
            // a device that switches mains.
            val live = reconnecting == null

            OutlineButton(
                text = "Cut power",
                onClick = { onCommand(SocketCommand.CUT) },
                enabled = live && status.state.isPowerOn,
                tint = Alarm,
                modifier = Modifier.weight(1f),
            )
            OutlineButton(
                // "Re-arm" whatever the state. It was "Turn back on" after a
                // cutoff, which reads as a light switch - and the socket does
                // not merely come back on, it goes back to watching. One name
                // for one action is also one less thing to explain.
                text = "Re-arm",
                onClick = { onCommand(SocketCommand.REARM) },
                enabled = live && (status.state == SocketState.CUTOFF || status.state.isAlarm),
                tint = Gold,
                modifier = Modifier.weight(1f),
            )
        }

        if (status.state == SocketState.CUTOFF) {
            Spacer(Modifier.height(10.dp))
            OutlineButton(
                text = "Check for a device now",
                onClick = { onCommand(SocketCommand.PROBE) },
                enabled = reconnecting == null,
                tint = Bone,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(Modifier.height(16.dp))

        // --- battery limit ---------------------------------------------------
        Panel(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                // Weighted, and the percentage unwrappable. Without this the
                // longer window text squeezed "72%" until the % wrapped onto its
                // own line under the number.
                Column(Modifier.weight(1f)) {
                    FieldLabel("This phone")
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = if (appManaging) {
                            "Charge to $batteryLimit%, back on at $resumeAt%"
                        } else {
                            "The socket decides for itself"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        color = Bone,
                    )
                }
                Spacer(Modifier.width(12.dp))
                Text(
                    text = "$batteryPercent%",
                    style = MaterialTheme.typography.titleMedium,
                    color = if (batteryPercent >= batteryLimit) Live else Muted,
                    maxLines = 1,
                    softWrap = false,
                )
            }

            Spacer(Modifier.height(8.dp))
            Text(
                text = "The socket can't measure a phone — the current is too small. " +
                    "This tells it directly.",
                style = MaterialTheme.typography.bodyMedium,
                color = Muted,
            )

            Spacer(Modifier.height(16.dp))

            // A slider rather than three preset buttons. 80 / 90 / 100 covered
            // the common cases and nothing else - somebody who wants 75, or 85,
            // or 60 for a battery they are trying to nurse, had no way to say
            // so. Five-point steps from 50 keep it easy to land on a round
            // number with a thumb.
            //
            // Dragging is local; the value is committed when the finger lifts.
            // Sending on every frame would fire a Bluetooth write per pixel.
            var dragging by remember(batteryLimit) { mutableStateOf<Int?>(null) }
            val shown = dragging ?: batteryLimit

            Text(
                text = "Stop at $shown%",
                style = MaterialTheme.typography.bodyMedium,
                color = if (appManaging) Gold else Muted,
            )

            // Hoisted, because the custom track below has to be given the same
            // ones - a track drawn with different colours to its own slider is
            // the sort of thing that only shows up on the day.
            val sliderColors = SliderDefaults.colors(
                thumbColor = Gold,
                activeTrackColor = Gold,
                // Surface3, not Muted. Muted is a text grey, and at full weight
                // beside gold it read as a second, lighter bar joined onto the
                // end of the first rather than as the empty part of one track.
                inactiveTrackColor = Surface3,
                disabledThumbColor = Muted,
                disabledActiveTrackColor = Muted,
                disabledInactiveTrackColor = Surface3,
            )

            Slider(
                value = shown.toFloat(),
                // ROUNDED HERE RATHER THAN BY `steps`.
                //
                // The five-point stops are exactly the ones `steps = 9` gave.
                // `steps` is dropped only because it is also what draws the row
                // of tick marks down the middle of the track, which against a
                // gold bar read as specks of dirt rather than as stops.
                onValueChange = { dragging = (it / 5f).roundToInt() * 5 },
                onValueChangeFinished = {
                    dragging?.let { onBatteryLimit(it) }
                    dragging = null
                },
                valueRange = 50f..100f,
                enabled = appManaging,
                colors = sliderColors,
                // Material 3's stock track breaks itself either side of the
                // thumb and drops a stop dot at the far end. Against gold those
                // do not read as styling: the gap makes one bar look like two
                // butted together, and the dot looks like a tick mark left
                // behind. Closed and unmarked, it reads as a single control.
                track = { state ->
                    SliderDefaults.Track(
                        sliderState = state,
                        colors = sliderColors,
                        enabled = appManaging,
                        thumbTrackGapSize = 0.dp,
                        drawStopIndicator = null,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("50%", style = MaterialTheme.typography.labelSmall, color = Muted)
                Text("100%", style = MaterialTheme.typography.labelSmall, color = Muted)
            }

            Spacer(Modifier.height(12.dp))

            // Switching this off tells the socket to go back to deciding for
            // itself, which is the only sensible thing for it to do when nobody
            // is managing it - not to sit there doing nothing.
            OutlineButton(
                text = if (appManaging) "Let the socket decide" else "Let this app manage charging",
                onClick = { onAppManaging(!appManaging) },
                tint = if (appManaging) Muted else Gold,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(Modifier.height(16.dp))

        // --- lifetime --------------------------------------------------------
        Panel(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                // Centred, because the History action is now a 48 dp target and
                // would otherwise sit a good deal lower than the label it is
                // paired with.
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FieldLabel("Lifetime")
                // The same chip as Export on the history screen, because it is
                // the same kind of thing: a gold-bordered way out of this panel
                // into the records behind it.
                OutlineButton(
                    text = "HISTORY",
                    onClick = onHistory,
                    tint = Gold,
                    dense = true,
                )
            }
            Spacer(Modifier.height(16.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                Stat(
                    label = "Cutoffs",
                    value = status.cutoffCount.toString(),
                    modifier = Modifier.weight(1f),
                )
                // A DASH, NOT A ZERO, FOR SOMETHING NOT YET MEASURED.
                //
                // These read 0 in the moments right after a successful cutoff -
                // the session peak is cleared and no load has been seen yet - so
                // the screen announced "0 W" and "0.00 A" directly underneath
                // the news that it had just worked. A zero is a measurement;
                // this is the absence of one, and the two should not look alike.
                //
                // ENERGY, NOT POWER, SO THE UNIT IS WATT-HOURS. Watts would say
                // how hard the load was pulling; watt-hours say how much
                // electricity never left the wall, which is the thing the socket
                // is for.
                Stat(
                    label = "Energy saved",
                    value = energySaved(heaviestMa, status.totalSavedMs),
                    modifier = Modifier.weight(1f),
                )
                Stat(
                    label = "Peak",
                    value = if (status.peakMa > 0) {
                        String.format(Locale.UK, "%.2f A", status.peakAmps)
                    } else {
                        NOT_YET
                    },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/**
 * The question asked before the link is dropped.
 *
 * It names the consequence rather than asking "are you sure?", because the thing
 * worth knowing is not that something is about to happen but **what** - the
 * socket carries on by itself, and the part that stops is this phone's own
 * charge limit, which is the feature the app exists for.
 *
 * Cancel is the quiet one and Disconnect wears the alarm colour: the destructive
 * choice should be the one that has to be aimed at.
 */
@Composable
private fun DisconnectDialog(onConfirm: () -> Unit, onCancel: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        shape = RoundedCornerShape(20.dp),
        containerColor = Surface1,
        title = {
            Text(
                text = "Disconnect?",
                style = MaterialTheme.typography.titleMedium,
                color = Bone,
            )
        },
        text = {
            Text(
                text = "The socket keeps cutting power on its own. This app stops " +
                    "watching this phone's battery, so it will no longer tell the " +
                    "socket when to stop charging it.",
                style = MaterialTheme.typography.bodyMedium,
                color = Muted,
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(
                    text = "DISCONNECT",
                    style = MaterialTheme.typography.labelLarge,
                    color = Alarm,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel) {
                Text(
                    text = "CANCEL",
                    style = MaterialTheme.typography.labelLarge,
                    color = Muted,
                )
            }
        },
    )
}

/**
 * Says the reading is old, and that something is being done about it.
 *
 * The numbers below stay on screen rather than being blanked: the last thing
 * the socket said is still the most useful thing on the page, as long as it is
 * labelled as the last thing rather than the current one.
 */
@Composable
private fun ReconnectingBanner(attempt: Int) {
    Panel(accent = true, modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(7.dp)
                    .clip(androidx.compose.foundation.shape.CircleShape)
                    .background(Gold),
            )
            Text(
                text = "Reconnecting",
                style = MaterialTheme.typography.titleMedium,
                color = Bone,
                modifier = Modifier.padding(start = 12.dp),
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = "$attempt of ${ReconnectPolicy.MAX_ATTEMPTS}",
                style = MaterialTheme.typography.labelSmall,
                color = Faint,
            )
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = "The link dropped. The readings below are the last ones the " +
                "socket sent. It keeps working on its own while this reconnects.",
            style = MaterialTheme.typography.bodyMedium,
            color = Muted,
        )
    }
}

/**
 * Where the current sits between the cutoff threshold and the session peak.
 *
 * The one thing worth drawing: the whole product is "watch this fall past that
 * line", and a number alone does not show how close it is.
 */
@Composable
private fun TaperBar(status: SocketStatus) {
    val span = (status.peakMa - status.thresholdMa).coerceAtLeast(1)
    val above = (status.currentMa - status.thresholdMa).coerceAtLeast(0)
    val fraction by animateFloatAsState(
        targetValue = (above.toFloat() / span).coerceIn(0f, 1f),
        animationSpec = tween(600),
        label = "taper",
    )
    val barColor by animateColorAsState(
        targetValue = if (fraction < 0.15f) Caution else Live,
        animationSpec = tween(600),
        label = "taper-tint",
    )

    Column {
        Box(
            Modifier
                .fillMaxWidth()
                .height(6.dp)
                .background(Surface3, androidx.compose.foundation.shape.RoundedCornerShape(3.dp)),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(fraction)
                    .height(6.dp)
                    .background(barColor, androidx.compose.foundation.shape.RoundedCornerShape(3.dp)),
            )
        }
        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = String.format(Locale.UK, "cuts below %.2f A", status.thresholdAmps),
                style = MaterialTheme.typography.labelSmall,
                color = Faint,
            )
            Text(
                text = String.format(Locale.UK, "peak %.2f A", status.peakAmps),
                style = MaterialTheme.typography.labelSmall,
                color = Faint,
            )
        }
    }
}

private fun SocketState.tint(): Color = when (this) {
    SocketState.CHARGING, SocketState.SETTLING -> Live
    SocketState.CUTOFF -> Gold
    SocketState.FAULT, SocketState.RELAY_STUCK -> Alarm
    SocketState.PROBING -> Caution
    else -> Muted
}

/** Stands in for a value that exists but has not been measured yet. An em dash. */
private const val NOT_YET = "—"

/**
 * Nominal UK mains, for turning a measured current into a power figure.
 *
 * The socket has no voltmeter - `docs/FINAL_BUILD.md` is clear that mains never
 * touches the low-voltage side - so this is the one number in the app that is
 * assumed rather than measured.
 */
private const val MainsVolts = 230

/**
 * Electricity the socket kept out of the wall, in watt-hours.
 *
 * Two measurements and one assumption: the heaviest current the socket saw, how
 * long it then held the relay open, and nominal mains for the voltage it has no
 * way to measure. Power times time, which is what a meter would have charged for
 * had the socket not cut.
 *
 * AN EM DASH UNTIL BOTH HALVES EXIST. With no load ever seen, or no time yet
 * accrued, the product is zero - and "0.00 Wh" claims a measurement of nothing
 * where the truth is that nothing has been measured.
 */
private fun energySaved(heaviestMa: Int, savedMs: Long): String {
    if (heaviestMa <= 0 || savedMs <= 0L) return NOT_YET

    val watts = heaviestMa * MainsVolts / 1000f
    val hours = savedMs / 3_600_000f
    val wh = watts * hours

    // Scaled precision. A socket that has been cut for a minute has saved
    // hundredths of a watt-hour, and one left overnight has saved tens - the
    // same format cannot serve both without either lying or reading as zero.
    return when {
        wh >= 10f -> String.format(Locale.UK, "%.0f Wh", wh)
        wh >= 1f -> String.format(Locale.UK, "%.1f Wh", wh)
        else -> String.format(Locale.UK, "%.2f Wh", wh)
    }
}

