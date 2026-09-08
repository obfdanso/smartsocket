# Android app — crash fix and presentation pass

> **Why now.** The app is demonstrated on Monday. A lecturer will hold the phone,
> the socket hardware will be in the room, and demo mode is the intended path.

Two jobs, in this order: stop the app dying, then stop it looking unfinished.

---

## 1. The app crashes on "Open demo" from a fresh install

Reproduced twice on a Galaxy A13, Android 14, then confirmed by controlled test.

```
java.lang.SecurityException: Starting FGS with type connectedDevice
  targetSDK=35 requires permissions:
  allOf=true  [FOREGROUND_SERVICE_CONNECTED_DEVICE]
  anyOf=false [BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT, BLUETOOTH_SCAN, ...]
    at SocketService.startForegroundCompat(SocketService.kt:89)
    at SocketService.onStartCommand(SocketService.kt:41)
```

### The chain

1. `openDemo()` connects `MockTransport.DEVICE`, so `linkState` reaches `Connected`
2. `SmartSocketApp` starts `SocketService` on **any** `Connected`
3. `startForeground(..., FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)`
4. Android 14+ requires the caller to hold one of the Bluetooth runtime
   permissions **as well as** the manifest one. Demo mode is the single path that
   never needs Bluetooth, so it is the path where the user has no reason to have
   granted it
5. The `SecurityException` is uncaught. The process dies

### Why it was never seen

Testing against real hardware means granting Bluetooth first, which makes the
service legal. The bug is only reachable by the one route that skips the radio —
and that is the route chosen for the demo.

### Why the existing guard does not catch it

`SocketService.start` wraps `startForegroundService` in `runCatching`. That
guards the *scheduling* of the service against
`ForegroundServiceStartNotAllowedException`. The `SecurityException` is thrown
later, on the service's own dispatch inside `onStartCommand`, where nothing is
watching.

### The fix, in two parts

**A simulated socket gets no foreground service.** `LinkState.Connected` already
carries its `SocketDevice`, and `SocketDevice.isDemo` already exists, so this
reads off state the app already has. A `connectedDevice` notification for a
device that does not exist was never honest — the service buys process lifetime
for a link, and the mock has no link to lose.

**A real link fails safe rather than fatal.** `startForegroundCompat` catches
`SecurityException` and stops the service instead of the process. Losing a
notification is a cost worth paying; losing the app over a device that switches
mains is not. Where the permission is present — every real-hardware case — the
behaviour is unchanged.

---

## 2. Presentation

Each of these was seen on the device, not inferred from the source.

| Defect | Fix |
|---|---|
| Onboarding and Splash ignore system insets — the footer sits under the nav bar | `MainActivity` passes `windowInsetsPadding` to all six screens, not four |
| Onboarding has a ~900 px void between body and dots | The content block centres in the space it is given instead of pinning to the top |
| `ConnectScreen` panels resize to fit their text, so "Bluetooth is off" is visibly narrower than the panel below it | `fillMaxWidth()` at the four call sites |
| Every tap is visually silent | `clickableNoRipple` implements the press-scale and colour shift its own comment already promises |
| `Disconnect`, `Back`, `History`, `Export`, `Clear` are bare text well under 48 dp | A shared action-label component with a 48 dp minimum target and unchanged visual size |
| Back exits the app from History | `BackHandler`: History returns to the dashboard, Onboarding steps back a page |
| The battery slider reads as a grey pill stuck to a gold one | Drop `steps = 9`, which is what draws the tick dots, and round to the nearest 5 in `onValueChange`. `inactiveTrackColor` becomes `Surface3` |
| `Peak 0.00 A` and `Power saved 0m` shown straight after a successful cutoff | Render an em dash for a zero. Nothing computed changes |
| Android's splash, then a 1500 ms one | 800 ms |

**The slider's behaviour must not change.** Five-point steps from 50, dragging
local, committed on finger-lift. `steps` is dropped only because it is what draws
the ticks; the rounding replaces it exactly.

---

## 3. Out of scope

Untouched, and the tests that cover them must still pass:

`BleTransport`, `BluetoothTransport`, `BleSerialProfile`, `StatusParser`,
`SocketRepository` connection logic, `ReconnectPolicy`, `BatteryWatcher`, the
wire protocol, and all firmware.

The constraint is the user's, and it is the right one: **nothing that could
affect pairing with the module or the live readings.** The crash fix touches
`SocketService` and `SmartSocketApp`, which sit on the connection path, and is
listed above rather than buried for that reason.

---

## 4. Verification

Failing to reproduce a crash is not evidence it is fixed, so:

1. `gradlew assembleDebug testDebugUnitTest` — 36 tests, all passing
2. Install, then **revoke** `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN` and
   `POST_NOTIFICATIONS` with `pm revoke`. That is the exact fresh-install state
   the lecturer will hold
3. Drive splash → onboarding → connect → demo → dashboard → history → back, by
   `adb`, and assert the crash buffer is empty at the end
4. Repeat with the permissions granted, to prove the real path is unchanged
5. Screenshot every screen, before and after

Step 2 is the whole point. The bug hides whenever permission happens to be
granted, which is why it survived until now.
