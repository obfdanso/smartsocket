package gh.group38.smartsocket.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.res.painterResource
import gh.group38.smartsocket.R

/**
 * The SS monogram. The app's mark, and the launcher icon's.
 *
 * The artwork is transparent, so it sits straight on [Ink] with no plate of its
 * own: the gold S reads at full strength and the outlined S ghosts behind it.
 *
 * It replaced a socket face drawn in Canvas. That one scaled to any size without
 * blurring, which this cannot - below about 40 dp the thin inner ring turns to
 * mush - but it was not the project's mark, and one mark used everywhere beats a
 * sharper drawing of the wrong thing.
 */
@Composable
fun LogoMark(
    size: Dp = 96.dp,
    modifier: Modifier = Modifier,
) {
    Image(
        painter = painterResource(id = R.drawable.logo_mark),
        contentDescription = "Smart Socket",
        modifier = modifier.size(size),
    )
}

/**
 * The name, letterspaced to match the mark.
 *
 * The tracking is the point: it is the same wide setting the monogram's own
 * "SMART SOCKET" carries, which is what ties a bare line of text to the logo
 * above it without repeating the logo.
 */
@Composable
fun Wordmark(modifier: Modifier = Modifier) {
    Text(
        text = "S M A R T   S O C K E T",
        style = MaterialTheme.typography.labelSmall,
        color = Muted,
        modifier = modifier,
    )
}

/** A rule. Structure without a box around it. */
@Composable
fun Hairline(modifier: Modifier = Modifier, color: Color = Surface3) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(color),
    )
}

/** A gold arc that sweeps while something is happening. */
@Composable
fun LoadingRing(size: Dp = 132.dp, modifier: Modifier = Modifier) {
    val spin = rememberInfiniteTransition(label = "ring")
    val angle by spin.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "sweep",
    )

    Canvas(modifier = modifier.size(size)) {
        val stroke = this.size.minDimension * 0.035f

        drawCircle(
            color = GoldFaint,
            radius = (this.size.minDimension - stroke) / 2f,
            style = Stroke(width = stroke),
        )
        drawArc(
            brush = Brush.sweepGradient(listOf(Color.Transparent, GoldDeep, Gold, GoldLight)),
            startAngle = angle,
            sweepAngle = 110f,
            useCenter = false,
            style = Stroke(width = stroke, cap = StrokeCap.Round),
        )
    }
}

/** Small uppercase label above a value. */
@Composable
fun FieldLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = Faint,
        modifier = modifier,
    )
}

/** A raised panel. The one container used everywhere, so nothing drifts. */
@Composable
fun Panel(
    modifier: Modifier = Modifier,
    accent: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(Surface1)
            .border(
                BorderStroke(1.dp, if (accent) GoldFaint else Surface3),
                RoundedCornerShape(20.dp),
            )
            .padding(20.dp),
        content = content,
    )
}

/** Status pill: a dot and a word. */
@Composable
fun StatePill(label: String, tint: Color, modifier: Modifier = Modifier) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .clip(CircleShape)
            .background(tint.copy(alpha = 0.12f))
            .border(BorderStroke(1.dp, tint.copy(alpha = 0.35f)), CircleShape)
            .padding(horizontal = 14.dp, vertical = 7.dp),
    ) {
        Box(
            Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(tint),
        )
        Spacer(Modifier.width(9.dp))
        Text(
            text = label.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = tint,
        )
    }
}

/** Primary action. Solid gold, dark text. */
@Composable
fun GoldButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val bg = if (enabled) Gold else Surface3
    val fg = if (enabled) Ink else Faint

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(54.dp)
            // BEFORE clip and background, so the whole button presses rather
            // than just its label. See clickableNoRipple.
            .then(if (enabled) Modifier.clickableNoRipple(onClick) else Modifier)
            .clip(RoundedCornerShape(16.dp))
            .background(bg),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.titleMedium,
            color = fg,
            textAlign = TextAlign.Center,
        )
    }
}

/** Secondary action. Outline only, so it never competes with the gold. */
@Composable
fun OutlineButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: Color = Bone,

    /**
     * A chip rather than a bar: small enough to sit at the end of a list row
     * without owning it. It carries its own colour on the border, because at
     * that size a neutral grey edge reads as disabled.
     */
    dense: Boolean = false,
) {
    val edge = when {
        !enabled -> Surface2
        dense -> tint.copy(alpha = 0.55f)
        else -> Surface3
    }
    val fg = if (enabled) tint else Faint
    val corner = if (dense) 10.dp else 14.dp

    Box(
        modifier = modifier
            .height(if (dense) 38.dp else 50.dp)
            .then(if (enabled) Modifier.clickableNoRipple(onClick) else Modifier)
            .clip(RoundedCornerShape(corner))
            .border(BorderStroke(1.dp, edge), RoundedCornerShape(corner)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = if (dense) {
                MaterialTheme.typography.labelSmall
            } else {
                MaterialTheme.typography.bodyMedium
            },
            color = fg,
            modifier = Modifier.padding(horizontal = if (dense) 14.dp else 18.dp),
        )
    }
}

/** A labelled value in a row of statistics. */
@Composable
fun Stat(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        FieldLabel(label)
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            color = Bone,
        )
    }
}
