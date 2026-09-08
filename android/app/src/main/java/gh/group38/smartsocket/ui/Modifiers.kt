package gh.group38.smartsocket.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.scale
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback

/**
 * Click with no ripple - but not with no feedback.
 *
 * Material's default ripple is a grey wash, and on gold it reads as a smear
 * rather than a press. So the press is shown instead of washed: the target
 * shrinks very slightly under the finger and springs back when it lifts, with a
 * light tick of haptic feedback on the way down.
 *
 * **This used to pass `indication = null` and stop there**, which left every
 * button in the app visually silent - a dead tap on a device that switches mains
 * is worse than an ugly one, because there is no way to tell it from a tap that
 * did not register.
 *
 * ORDER MATTERS AT THE CALL SITE. `scale` only transforms what is drawn after it
 * in the chain, so this must come **before** any `clip` or `background` that
 * should shrink with the press. Placed last, only the content moves and the
 * panel behind it stays put, which looks like a glitch rather than a press.
 */
fun Modifier.clickableNoRipple(onClick: () -> Unit): Modifier = composed {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val haptics = LocalHapticFeedback.current

    // Small. A press should be felt more than seen - anything deeper reads as
    // the element falling over rather than being touched.
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.97f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMediumLow,
        ),
        label = "press-scale",
    )

    scale(scale).clickable(
        interactionSource = interaction,
        indication = null,
        onClick = {
            // The light tick, not the long-press thud. No VIBRATE permission:
            // view haptics are a system affordance, not the vibrator API.
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onClick()
        },
    )
}
