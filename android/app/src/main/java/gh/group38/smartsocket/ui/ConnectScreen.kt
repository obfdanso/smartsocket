package gh.group38.smartsocket.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ScrollState
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import gh.group38.smartsocket.data.LinkKind
import gh.group38.smartsocket.data.LinkState
import gh.group38.smartsocket.data.SocketDevice

@Composable
fun ConnectScreen(
    devices: List<SocketDevice>,
    linkState: LinkState,
    bluetoothOn: Boolean,
    permissionGranted: Boolean,
    scanning: Boolean,
    onRequestPermission: () -> Unit,

    /** Every sweep the user asked for, by pressing Search. */
    onScan: () -> Unit,

    /** The single sweep nobody asked for. Does nothing after the first call. */
    onAutoScan: () -> Unit,
    onSelect: (SocketDevice) -> Unit,
    onDemo: () -> Unit,

    /**
     * Whether a failure is currently worth a dialog - true only once the user
     * has actually asked for a connection.
     *
     * **Owned by the caller, and it has to be.** This screen is swapped out for
     * the connecting screen while the link is being opened, so anything
     * `remember`ed here is gone by the time the failure arrives and the screen
     * comes back. The flag has to outlive the screen that raises it.
     */
    errorVisible: Boolean,
    onDismissError: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // ONE SWEEP, NOT ONE PER VISIT.
    //
    // This screen is arrived at for several different reasons - launch, a
    // disconnect, a failed connection, backing out of the dashboard - and each
    // arrival used to start twelve seconds of low-latency scanning. From the
    // outside that is an app searching the airwaves at random.
    //
    // [onAutoScan] runs at most once for the life of the app; every sweep after
    // it is one the user asked for by pressing Search.
    LaunchedEffect(permissionGranted, bluetoothOn) {
        if (permissionGranted && bluetoothOn) onAutoScan()
    }

    // Folded away until asked for, and hoisted to the screen so that a sweep
    // finishing - which swaps the branch below - does not fold it back up under
    // the user's finger.
    var devicesExpanded by remember { mutableStateOf(false) }

    // Always opens at the top. Deliberately `remember` rather than
    // `rememberScrollState`: the saveable one restores the previous offset when
    // the activity is recreated, so the screen scrolls itself while layout is
    // still settling.
    val scroll = remember { ScrollState(0) }

    // A FAILURE IS ONLY WORTH A DIALOG IF THE USER ASKED FOR THE CONNECTION.
    //
    // The app reconnects to the remembered socket the moment the process starts,
    // entirely on its own. When that device is out of range - which it is every
    // time the socket is not powered - the link fails within seconds of launch,
    // and the first thing the user met was a modal about an attempt they never
    // made. Silence is right there: nothing was asked for, so nothing is owed.
    (linkState as? LinkState.Failed)
        ?.takeIf { errorVisible }
        ?.let { failed ->
            ConnectionErrorDialog(failed = failed, onDismiss = onDismissError)
        }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Ink)
            .verticalScroll(scroll)
            .padding(horizontal = 22.dp, vertical = 18.dp),
    ) {
        Wordmark()
        Spacer(Modifier.height(14.dp))
        Hairline()
        Spacer(Modifier.height(32.dp))

        LogoMark(
            size = 132.dp,
            modifier = Modifier.align(Alignment.CenterHorizontally),
        )

        Spacer(Modifier.height(32.dp))

        Text(
            text = "Choose a socket",
            style = MaterialTheme.typography.headlineMedium,
            color = Bone,
        )
        Spacer(Modifier.height(12.dp))

        when {
            !permissionGranted -> {
                Text(
                    text = "Android needs your permission before the app can look for " +
                        "the socket.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Muted,
                )
                Spacer(Modifier.height(16.dp))
                GoldButton(text = "Allow", onClick = onRequestPermission)
            }

            !bluetoothOn -> Text(
                text = "Bluetooth is off. Turn it on in your phone's settings, then " +
                    "come back.",
                style = MaterialTheme.typography.bodyMedium,
                color = Muted,
            )

            devices.isEmpty() -> {
                Text(
                    text = if (scanning) {
                        "Looking for the socket. Make sure it is powered — the module " +
                            "advertises constantly once it has 5 V."
                    } else {
                        "Nothing found yet. Power the socket up and tap Search. A " +
                            "Bluetooth LE module never appears in Android's Bluetooth " +
                            "settings, so this is the only place it can show up."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = Muted,
                )
                Spacer(Modifier.height(16.dp))
                GoldButton(
                    text = if (scanning) "SEARCHING…" else "SEARCH",
                    onClick = onScan,
                )
            }

            else -> {
                // THE LIST IS FOLDED AWAY UNTIL IT IS ASKED FOR.
                //
                // A sweep in a building comes back with dozens of phones,
                // earbuds and watches, nearly all of them unnamed and using
                // rotating private addresses. Poured straight onto the screen
                // they push everything else - including Run - off the bottom,
                // and bury the one device the user actually came for.
                DisclosureHeader(
                    label = "Devices found",
                    count = devices.size,
                    expanded = devicesExpanded,
                    onToggle = { devicesExpanded = !devicesExpanded },
                )

                AnimatedVisibility(visible = devicesExpanded) {
                    Column {
                        devices.forEach { device ->
                            DeviceRow(
                                device = device,
                                onConnect = { onSelect(device) },
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                // OUTSIDE the fold, not inside it. Offered whether or not the
                // list is open: the socket may simply not have answered the
                // first sweep, and a search that can only be reached by first
                // opening a list of strangers' earbuds is a search nobody finds.
                GoldButton(
                    text = if (scanning) "SEARCHING…" else "SEARCH",
                    onClick = onScan,
                )
            }
        }

        Spacer(Modifier.height(32.dp))
        Hairline()
        Spacer(Modifier.height(20.dp))

        // Present from the start, not hidden behind a debug flag: the socket is a
        // physical object that may be in another room, and the app should still
        // be worth opening.
        FieldLabel("No hardware to hand")
        Spacer(Modifier.height(14.dp))
        GoldButton(text = "RUN", onClick = onDemo)

        Spacer(Modifier.height(24.dp))
    }
}

/**
 * A failed connection, as something the user dismisses.
 *
 * **It used to be a line of red text under the button**, which stayed there for
 * the rest of the session: the link state only changes when something else
 * happens to it, so tapping a pair of earbuds once left "Could not connect"
 * sitting on the screen with nothing to clear it. On a list as long as a phone's
 * bonded devices it also fell below the fold, so the tap looked like it had
 * simply done nothing at all.
 *
 * Nothing is reset in the repository to make this go away. The link state is
 * left exactly as it is, and only this screen's willingness to draw the dialog
 * changes - see `userAsked` above.
 *
 * **The reason is kept as the body on purpose.** The transport distinguishes a
 * link that never opened from one that opened and stayed silent, and from one
 * that sent bytes nobody could parse. Those three mean check the pairing, check
 * TXD, and check the baud rate - which is exactly the information needed when
 * the module is on the bench. The title says the everyday thing; the line under
 * it says which everyday thing.
 */
@Composable
private fun ConnectionErrorDialog(failed: LinkState.Failed, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(20.dp),
        containerColor = Surface1,
        title = {
            Text(
                text = "Device not in range",
                style = MaterialTheme.typography.titleMedium,
                color = Alarm,
            )
        },
        text = {
            Text(
                text = failed.reason,
                style = MaterialTheme.typography.bodyMedium,
                color = Muted,
            )
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(
                    text = "OK",
                    style = MaterialTheme.typography.labelLarge,
                    color = Gold,
                )
            }
        },
    )
}

/** Tappable section header. The chevron turns to say which way it goes. */
@Composable
private fun DisclosureHeader(
    label: String,
    count: Int,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    val turn by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        animationSpec = tween(220),
        label = "chevron",
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickableNoRipple(onToggle)
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FieldLabel("$label  ($count)")
        Icon(
            imageVector = Icons.Rounded.KeyboardArrowDown,
            contentDescription = if (expanded) "Hide the device list" else "Show the device list",
            tint = Gold,
            modifier = Modifier.rotate(turn),
        )
    }
    Hairline(color = Surface3)
}

/**
 * ONLY THE BUTTON CONNECTS.
 *
 * The whole row used to be tappable. With forty-odd devices in the list that
 * means a scroll which ends with a fingertip resting on a row opens a Bluetooth
 * link to a stranger's earbuds - and on this app that also starts a foreground
 * service and a reconnect schedule. A row is something to read; the button is
 * the thing to press.
 */
@Composable
private fun DeviceRow(device: SocketDevice, onConnect: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = device.name,
                style = MaterialTheme.typography.bodyLarge,
                color = Bone,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            // ONLY SAYS SOMETHING WHEN THERE IS SOMETHING TO SAY.
            //
            // "Bluetooth Classic" is gone: it was on nearly every bonded row,
            // which made it noise rather than information. Bluetooth LE stays,
            // because it is the surprising one - the module in this project is
            // sold as an HC-05 and is not one, and which radio a device speaks
            // decides everything about how the app talks to it.
            val note = buildString {
                if (device.kind == LinkKind.BLE) append("Bluetooth LE")
                // Distance, roughly. The socket is the one in front of you, so
                // "very close" is the strongest hint available for telling it
                // from a stranger's phone two rooms away.
                device.rssi?.let { rssi ->
                    if (isNotEmpty()) append("  ·  ")
                    append(
                        when {
                            rssi >= -55 -> "very close"
                            rssi >= -70 -> "nearby"
                            rssi >= -85 -> "far"
                            else -> "very far"
                        }
                    )
                }
            }
            if (note.isNotEmpty()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    text = note,
                    style = MaterialTheme.typography.labelSmall,
                    color = Faint,
                )
            }
        }

        // No MAC address. It was the only thing telling two identically-named
        // devices apart, but a column of hex down the middle of the list is
        // noise for everyone who is not doing that - and the socket is picked
        // out by name and proximity, not by address.
        Spacer(Modifier.width(12.dp))
        OutlineButton(
            text = "CONNECT",
            onClick = onConnect,
            tint = Gold,
            dense = true,
        )
    }
    Hairline(color = Surface2)
}

/** Shown while the socket is being reached. */
@Composable
fun ConnectingScreen(name: String) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Ink),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(contentAlignment = Alignment.Center) {
            LoadingRing(size = 172.dp)
            LogoMark(size = 116.dp)
        }
        Spacer(Modifier.height(28.dp))
        Text(
            text = "Connecting",
            style = MaterialTheme.typography.titleMedium,
            color = Bone,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = name,
            style = MaterialTheme.typography.bodyMedium,
            color = Muted,
        )
    }
}
