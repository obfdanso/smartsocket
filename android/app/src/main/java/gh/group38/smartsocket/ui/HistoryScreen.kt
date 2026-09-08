package gh.group38.smartsocket.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import gh.group38.smartsocket.data.ChargeSession
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun HistoryScreen(
    sessions: List<ChargeSession>,
    onBack: () -> Unit,
    onClear: () -> Unit,
    onExport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // The system back gesture goes back, rather than out of the app. This screen
    // is reached from the dashboard, so that is where it returns - leaving the
    // app entirely from a list of past charges is not what anyone means by it.
    BackHandler { onBack() }

    // Clearing asks first. It is not undoable, and it reaches past this app: the
    // lifetime cutoff count and saved time live in the socket's EEPROM, so this
    // zeroes the socket as well as the phone.
    var confirmingClear by remember { mutableStateOf(false) }

    if (confirmingClear) {
        AlertDialog(
            onDismissRequest = { confirmingClear = false },
            shape = RoundedCornerShape(20.dp),
            containerColor = Surface1,
            title = {
                Text(
                    text = "Clear history?",
                    style = MaterialTheme.typography.titleMedium,
                    color = Bone,
                )
            },
            text = {
                Text(
                    text = "Every recorded charge is deleted, and the socket's own " +
                        "lifetime cutoff count and saved time are reset to zero. " +
                        "This cannot be undone.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Muted,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmingClear = false
                        onClear()
                    }
                ) {
                    Text(
                        text = "CLEAR",
                        style = MaterialTheme.typography.labelLarge,
                        color = Alarm,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmingClear = false }) {
                    Text(
                        text = "CANCEL",
                        style = MaterialTheme.typography.labelLarge,
                        color = Muted,
                    )
                }
            },
        )
    }

    // NOTHING RECORDED IS ITS OWN SCREEN, CENTRED.
    //
    // It used to be the same top-aligned layout with the list simply missing,
    // which left one grey sentence in the top corner above a screenful of
    // nothing - indistinguishable from a screen that had failed to load. An
    // empty state centred in the space it occupies reads as deliberate.
    //
    // Split out rather than centred in place because the list below scrolls, and
    // a scrolling column has unbounded height: there is no middle to centre in.
    if (sessions.isEmpty()) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Ink)
                .padding(horizontal = 40.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "History",
                    style = MaterialTheme.typography.headlineMedium,
                    color = Bone,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "Charges appear here once the socket has cut power at least once.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Muted,
                    textAlign = TextAlign.Center,
                )
            }
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Ink)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 22.dp, vertical = 32.dp),
    ) {
        // NO "BACK" LABEL. Android already has a back gesture and a back key,
        // both of which this screen honours, and a word on the screen doing what
        // the system control beside it already does is one thing too many.
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlineButton(
                text = "EXPORT",
                onClick = onExport,
                tint = Gold,
                dense = true,
            )
            Spacer(Modifier.width(10.dp))
            // Alarm, like Disconnect, because it is the same kind of act: it
            // throws away every charge recorded and zeroes the socket's own
            // lifetime totals with them.
            OutlineButton(
                text = "CLEAR",
                onClick = { confirmingClear = true },
                tint = Alarm,
                dense = true,
            )
        }

        Spacer(Modifier.height(24.dp))

        Text(
            text = "History",
            style = MaterialTheme.typography.headlineMedium,
            color = Bone,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "${sessions.size} ${if (sessions.size == 1) "charge" else "charges"} recorded",
            style = MaterialTheme.typography.bodyMedium,
            color = Muted,
        )

        Spacer(Modifier.height(24.dp))

        Panel(modifier = Modifier.fillMaxWidth()) {
            FieldLabel("Peak current per charge")
            Spacer(Modifier.height(18.dp))
            PeakChart(
                sessions = sessions.take(20).reversed(),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp),
            )
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "oldest",
                    style = MaterialTheme.typography.labelSmall,
                    color = Faint,
                )
                Text(
                    text = "newest",
                    style = MaterialTheme.typography.labelSmall,
                    color = Faint,
                )
            }
        }

        Spacer(Modifier.height(16.dp))

        sessions.forEach { session ->
            SessionRow(session)
            Spacer(Modifier.height(10.dp))
        }
    }
}

/**
 * Bars, not a line.
 *
 * Each charge is a discrete event, not a sample of something continuous, and a
 * line drawn between them implies values in the gaps that were never measured.
 */
@Composable
private fun PeakChart(sessions: List<ChargeSession>, modifier: Modifier = Modifier) {
    val maxMa = (sessions.maxOfOrNull { it.peakMa } ?: 1).coerceAtLeast(1)

    Canvas(modifier = modifier) {
        if (sessions.isEmpty()) return@Canvas

        val gap = size.width * 0.02f
        val barWidth = ((size.width - gap * (sessions.size - 1)) / sessions.size)
            .coerceAtLeast(2f)

        sessions.forEachIndexed { index, session ->
            val fraction = session.peakMa.toFloat() / maxMa
            val barHeight = (size.height * fraction).coerceAtLeast(2f)
            val x = index * (barWidth + gap)

            // Faint full-height track, so short bars still read as "short"
            // rather than as missing.
            drawRoundRect(
                color = Surface3,
                topLeft = Offset(x, 0f),
                size = Size(barWidth, size.height),
                cornerRadius = CornerRadius(barWidth / 2, barWidth / 2),
            )
            drawRoundRect(
                color = if (index == sessions.lastIndex) GoldLight else Gold,
                topLeft = Offset(x, size.height - barHeight),
                size = Size(barWidth, barHeight),
                cornerRadius = CornerRadius(barWidth / 2, barWidth / 2),
            )
        }
    }
}

@Composable
private fun SessionRow(session: ChargeSession) {
    val stamp = remember(session.endedAtMillis) {
        SimpleDateFormat("d MMM · HH:mm", Locale.UK).format(Date(session.endedAtMillis))
    }

    Panel(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stamp,
                style = MaterialTheme.typography.titleMedium,
                color = Bone,
            )
            Text(
                text = String.format(Locale.UK, "%.2f A peak", session.peakAmps),
                style = MaterialTheme.typography.bodyMedium,
                color = Gold,
            )
        }

        Spacer(Modifier.height(14.dp))

        Row(modifier = Modifier.fillMaxWidth()) {
            Stat(
                label = "Charged for",
                value = formatShort(session.durationMs),
                modifier = Modifier.weight(1f),
            )
            Stat(
                label = "Cut at",
                value = String.format(Locale.UK, "%.2f A", session.cutAtMa / 1000f),
                modifier = Modifier.weight(1f),
            )
            Stat(
                label = "Taper",
                value = "${(session.taperFraction * 100).toInt()}%",
                modifier = Modifier.weight(1f),
            )
        }
    }
}

private fun formatShort(ms: Long): String {
    val minutes = ms / 60_000
    return when {
        minutes >= 60 -> "${minutes / 60}h ${minutes % 60}m"
        minutes > 0 -> "${minutes}m"
        else -> "${ms / 1000}s"
    }
}
