using System.ComponentModel;
using System.IO;
using System.Windows;
using System.Windows.Media;
using SmartSocket.App.Transport;
using SmartSocket.Core;
using MessageBox = System.Windows.MessageBox;

namespace SmartSocket.App;

/// <summary>
/// The whole UI. Three views in one shell, switched by visibility rather than
/// by navigation - there are only three, and every one of them wants the same
/// header.
///
/// This window owns no state that matters. The link, the battery watch and the
/// history all live on <see cref="App"/>, so closing it loses nothing.
/// </summary>
public partial class MainWindow : Window
{
    private enum View { Connect, Dashboard, History }

    private static SocketRepository Repo => App.Repository;
    private static BatteryWatcher Battery => App.Battery;
    private static AppSettings Settings => App.Settings;

    /// <summary>Guards the input handlers while the UI is being seeded.</summary>
    private bool _loading = true;

    public MainWindow()
    {
        InitializeComponent();

        LimitSlider.Value = Settings.BatteryLimit;
        LimitLabel.Text = $"Charge to {Settings.BatteryLimit}%, back on at {Settings.ResumeAt}%";
        CutOnLimitBox.IsChecked = Settings.CutOnLimit;
        _loading = false;

        Repo.StatusChanged += OnStatus;
        Repo.LinkChanged += OnLink;
        Repo.History.Changed += OnHistoryChanged;
        Battery.Changed += OnBatteryChanged;

        Closing += OnClosing;

        // The handle does not exist until the window is being created, and the
        // DWM attributes need one.
        SourceInitialized += (_, _) => ApplyTitleBarTheme();

        RefreshPorts();
        RenderBattery();
        RenderLink(Repo.Link);
        RenderStatus(Repo.Status);
        ShowView(Repo.IsConnected ? View.Dashboard : View.Connect);
    }

    // --- view switching -------------------------------------------------------

    private void ShowView(View view)
    {
        ConnectView.Visibility = view == View.Connect ? Visibility.Visible : Visibility.Collapsed;
        DashboardView.Visibility = view == View.Dashboard ? Visibility.Visible : Visibility.Collapsed;
        HistoryView.Visibility = view == View.History ? Visibility.Visible : Visibility.Collapsed;
    }

    /// <summary>
    /// Hides rather than exits. The socket is still being watched and the tray
    /// icon says so - quitting is a deliberate act from that menu.
    /// </summary>
    private void OnClosing(object? sender, CancelEventArgs e)
    {
        e.Cancel = true;
        Hide();
    }

    // --- repository events, marshalled onto the UI thread ---------------------

    private void OnStatus(SocketStatus status) => Dispatcher.Invoke(() => RenderStatus(status));

    private void OnBatteryChanged() => Dispatcher.Invoke(RenderBattery);

    private void OnHistoryChanged() => Dispatcher.Invoke(RenderHistory);

    private void OnLink(LinkState state) => Dispatcher.Invoke(() =>
    {
        RenderLink(state);

        // The history view is never yanked out from under the user by a link
        // event - it is the one screen that does not depend on being connected.
        if (HistoryView.Visibility == Visibility.Visible) return;

        switch (state)
        {
            case LinkState.Connected:
                _connectRequested = false;
                ShowView(View.Dashboard);
                break;

            case LinkState.Failed failed:
                ShowView(View.Connect);

                // A FAILURE IS ONLY WORTH A DIALOG IF THE USER ASKED FOR THE
                // CONNECTION. The app reconnects to the remembered socket the
                // moment it starts, entirely on its own, and when that device is
                // out of range - which it is every time the socket is not
                // powered - the first thing the user met was a box about an
                // attempt they never made.
                if (_connectRequested)
                {
                    _connectRequested = false;

                    // The reason is kept as the body on purpose: the transport
                    // tells a link that never opened from one that opened and
                    // stayed silent, and from one sending bytes nobody can
                    // parse. Those three mean check the pairing, check TXD, and
                    // check the baud rate.
                    AppDialog.Warn(this, "Device not in range", failed.Reason);
                }
                break;

            case LinkState.Idle:
                ShowView(View.Connect);
                break;

            // Reconnecting deliberately leaves the view alone. Bouncing back to
            // the port picker would throw away the case the tray exists for.
        }
    });

    // --- rendering ------------------------------------------------------------

    private void RenderLink(LinkState state) => LinkLine.Text = state switch
    {
        // Naming the BLE profile that matched: on a module sold under someone
        // else's name, that string is the most reliable identification of what
        // it actually is.
        LinkState.Connected c when c.Device.Kind == LinkKind.Ble =>
            $"Connected to {c.Device.Name} over Bluetooth LE ({Repo.BleProfileName ?? "unknown profile"})",

        LinkState.Connected c => $"Connected to {c.Device.Name}",
        LinkState.Connecting => "Connecting…",
        LinkState.Reconnecting r =>
            $"Lost the link. Trying again — attempt {r.Attempt} of {ReconnectPolicy.MaxAttempts}",
        _ => "Not connected",
    };

    private void RenderStatus(SocketStatus status)
    {
        StateLabel.Text = status.State.Label();
        StateLabel.Foreground = Brush(status.State.IsAlarm() ? "Alarm" : "Gold");
        StateDetail.Text = status.State.Detail();

        CurrentReadout.Text = $"{status.Amps:0.00} A";

        // The firmware zeroes peak, threshold and elapsed outside Charging on
        // purpose - holding the last session's figures there would show old
        // numbers as if they were live. So a dash means "no charge session is
        // running", not "unknown".
        PeakReadout.Text = status.PeakMa > 0
            ? $"{status.PeakAmps:0.00} A"
            : "—";

        // While the app is managing, the socket's current threshold is not what
        // cuts the power - the battery percentage is, and the threshold is not
        // even consulted. Showing a current here would be describing a rule that
        // is switched off.
        ThresholdReadout.Text = Settings.CutOnLimit
            ? $"{Settings.BatteryLimit}%"
            : status.ThresholdMa > 0
                ? $"{status.ThresholdAmps:0.00} A"
                : "—";

        RelayReadout.Text = status.RelayClosed ? "CLOSED" : "OPEN";
        RelayReadout.Foreground = Brush(status.RelayClosed ? "Live" : "Muted");

        // Only where it means something. There is nothing to check for while a
        // charge is running - the phone offers this in Cutoff and nowhere else.
        ProbeButton.Visibility = status.State == SocketState.Cutoff
            ? Visibility.Visible
            : Visibility.Collapsed;

        SessionReadout.Text = status.SessionElapsedMs > 0
            ? $"Charging for {Duration(status.SessionElapsedMs)}"
            : "No charge session running";

        // ENERGY, NOT DURATION, TO MATCH THE PHONE. "14m of power saved" says
        // how long the wall was off; watt-hours say how much electricity never
        // left it, which is the thing the socket is actually for.
        if (status.PeakMa > _heaviestMa) _heaviestMa = status.PeakMa;

        SavedReadout.Text =
            $"{status.CutoffCount} cutoff{(status.CutoffCount == 1 ? "" : "s")}, " +
            $"{EnergySaved(_heaviestMa, status.TotalSavedMs)} saved";
    }

    /// <summary>
    /// The heaviest draw seen since this window opened.
    ///
    /// Kept because the firmware clears <c>PeakMa</c> the instant the socket
    /// cuts, so reading the live value would blank the figure at exactly the
    /// moment it is worth showing - the one right after the wall went off.
    /// </summary>
    private int _heaviestMa;

    /// <summary>
    /// Electricity the socket kept out of the wall, in watt-hours.
    ///
    /// Two measurements and one assumption: the heaviest current the socket saw,
    /// how long it then held the relay open, and nominal mains for the voltage
    /// it has no way to measure. Power times time, which is what a meter would
    /// have charged for had the socket not cut.
    ///
    /// An em dash until both halves exist, because "0.00 Wh" claims a
    /// measurement of nothing where the truth is that nothing has been measured.
    /// </summary>
    private static string EnergySaved(int heaviestMa, long savedMs)
    {
        if (heaviestMa <= 0 || savedMs <= 0) return "—";

        var watts = heaviestMa * MainsVolts / 1000.0;
        var hours = savedMs / 3_600_000.0;
        var wh = watts * hours;

        // Scaled precision. A socket cut for a minute has saved hundredths of a
        // watt-hour, one left overnight has saved tens, and one format cannot
        // serve both without either lying or reading as zero.
        return wh switch
        {
            >= 10 => $"{wh:0} Wh",
            >= 1 => $"{wh:0.0} Wh",
            _ => $"{wh:0.00} Wh",
        };
    }

    /// <summary>
    /// Nominal UK mains, for turning a measured current into a power figure.
    /// The socket has no voltmeter - mains never touches the low-voltage side -
    /// so this is the one number in the app that is assumed rather than measured.
    /// </summary>
    private const int MainsVolts = 230;

    private void RenderBattery()
    {
        if (!Battery.HasBattery)
        {
            BatteryReadout.Text = "No battery";
            BatteryNote.Text =
                "This machine has no battery, so there is no percentage to cut at. " +
                "The socket still cuts on its own when the current tapers.";
            CutOnLimitBox.IsEnabled = false;
            LimitSlider.IsEnabled = false;
            return;
        }

        BatteryReadout.Text = Battery.Percent >= 0 ? $"{Battery.Percent}%" : "—";
        BatteryReadout.Foreground =
            Brush(Battery.Percent >= Settings.BatteryLimit ? "Live" : "Paper");

        BatteryNote.Text = Settings.CutOnLimit
            ? $"Cuts at {Settings.BatteryLimit}%, charges again at {Settings.ResumeAt}%. " +
              (Battery.OnAcPower
                  ? "The socket's own guesswork is switched off while this is on."
                  : "On battery — nothing to cut until the charger is plugged back in.")
            : "The socket decides for itself, from the charge current. Less accurate on a laptop.";
    }

    private void RenderHistory()
    {
        HistoryList.Items.Clear();

        if (Repo.History.Sessions.Count == 0)
        {
            // The phone's wording, and its behaviour: nothing to export and
            // nothing to clear, so neither action is offered.
            HistoryList.Items.Add("Charges appear here once the socket has cut power at least once.");
            HistoryActions.Visibility = Visibility.Collapsed;
            return;
        }

        HistoryActions.Visibility = Visibility.Visible;

        foreach (var s in Repo.History.Sessions)
        {
            var when = DateTimeOffset.FromUnixTimeMilliseconds(s.EndedAtMillis).LocalDateTime;
            HistoryList.Items.Add(
                $"{when:yyyy-MM-dd HH:mm}   peak {s.PeakAmps:0.00} A   " +
                $"cut at {s.CutAtMa / 1000f:0.00} A ({s.TaperFraction * 100:0}%)   " +
                Duration(s.DurationMs));
        }
    }

    private Brush Brush(string key) => (Brush)FindResource(key);

    private static string Duration(long ms)
    {
        var span = TimeSpan.FromMilliseconds(ms);
        if (span.TotalHours >= 1) return $"{(int)span.TotalHours}h {span.Minutes}m";
        if (span.TotalMinutes >= 1) return $"{span.Minutes}m {span.Seconds}s";
        return $"{span.Seconds}s";
    }

    // --- connect view ---------------------------------------------------------

    /// <summary>What is currently in the list, in the order it is shown.</summary>
    private List<SocketDevice> _devices = [];

    private async void RefreshPorts()
    {
        PortList.Items.Clear();
        PortList.IsEnabled = false;
        PortList.Items.Add("Looking…");

        // THE BUTTON SAYS SO TOO. Only the list changed before, and enumerating
        // the Bluetooth radio takes long enough that a click with no visible
        // answer reads as a button that does nothing - so it gets clicked again,
        // and again. The phone's Search does exactly this.
        SearchButton.Content = "SEARCHING…";
        SearchButton.IsEnabled = false;

        // Enumerating BLE devices goes out to the Bluetooth radio, so it cannot
        // be done on the UI thread the way listing COM ports can.
        try
        {
            _devices = [.. await SocketRepository.AvailableDevicesAsync()];
        }
        finally
        {
            // In a finally, so a radio that throws cannot leave the button
            // saying "SEARCHING…" for the rest of the session.
            SearchButton.Content = "SEARCH";
            SearchButton.IsEnabled = true;
        }

        PortList.Items.Clear();

        if (_devices.Count == 0)
        {
            PortList.Items.Add("Nothing found — no COM ports and no paired Bluetooth devices");
            return;
        }

        PortList.IsEnabled = true;
        foreach (var d in _devices) PortList.Items.Add(d.Display);

        // Preselect what was used last, so reconnecting is one click.
        if (Settings.LastPort is { } last)
        {
            var index = _devices.FindIndex(d => d.Id == last);
            if (index >= 0) PortList.SelectedIndex = index;
        }

        if (PortList.SelectedIndex < 0) PortList.SelectedIndex = 0;
    }

    private void OnRefreshPorts(object sender, RoutedEventArgs e) => RefreshPorts();

    private async void OnConnect(object sender, RoutedEventArgs e)
    {
        if (!PortList.IsEnabled) return;

        var index = PortList.SelectedIndex;
        if (index < 0 || index >= _devices.Count) return;

        var device = _devices[index];

        // The user asked for this one, so a failure is worth interrupting them
        // about. See the LinkState.Failed case.
        _connectRequested = true;
        Settings.LastPort = device.Id;
        Settings.Save();

        await Repo.ConnectAsync(device);
    }

    private async void OnDemo(object sender, RoutedEventArgs e)
    {
        await Repo.ConnectAsync(SocketDevice.Demo);
    }

    /// <summary>
    /// Whether a failure is currently worth a dialog - true only once the user
    /// has actually asked for a connection.
    /// </summary>
    private bool _connectRequested;

    // --- title bar ------------------------------------------------------------

    [System.Runtime.InteropServices.DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    private const int DwmUseImmersiveDarkMode = 20;
    private const int DwmCaptionColour = 35;
    private const int DwmTextColour = 36;
    private const int DwmBorderColour = 34;

    /// <summary>
    /// Paints the title bar in the app's own colours.
    ///
    /// A GOLD-ON-BLACK WINDOW UNDER A WHITE WIN32 CAPTION looks like the app
    /// stops at the top edge. These are the real system attributes rather than a
    /// custom chrome: the caption stays a caption, so snapping, dragging,
    /// double-click-to-maximise and the Windows 11 snap flyout all keep working,
    /// which a hand-drawn title bar would have to reimplement one at a time.
    ///
    /// Windows 11 21H2 and later for the colour attributes; the dark-mode flag
    /// goes back to Windows 10 1809. Older builds simply ignore what they do not
    /// know, so there is nothing to guard.
    /// </summary>
    private void ApplyTitleBarTheme()
    {
        var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        if (handle == IntPtr.Zero) return;

        var dark = 1;
        DwmSetWindowAttribute(handle, DwmUseImmersiveDarkMode, ref dark, sizeof(int));

        // DWM wants COLORREF - 0x00BBGGRR - so the bytes are the reverse of the
        // hex a designer would write.
        var caption = Bgr(0x0B, 0x0B, 0x0C);   // Ink
        var text = Bgr(0xF2, 0xEE, 0xE6);      // Paper
        var border = Bgr(0x26, 0x26, 0x2A);    // Surface3

        DwmSetWindowAttribute(handle, DwmCaptionColour, ref caption, sizeof(int));
        DwmSetWindowAttribute(handle, DwmTextColour, ref text, sizeof(int));
        DwmSetWindowAttribute(handle, DwmBorderColour, ref border, sizeof(int));
    }

    private static int Bgr(int r, int g, int b) => r | (g << 8) | (b << 16);

    // --- dashboard ------------------------------------------------------------

    private async void OnCut(object sender, RoutedEventArgs e) =>
        await Repo.SendAsync(SocketCommand.Cut);

    private async void OnRearm(object sender, RoutedEventArgs e) =>
        await Repo.SendAsync(SocketCommand.Rearm);

    private async void OnProbe(object sender, RoutedEventArgs e) =>
        await Repo.SendAsync(SocketCommand.Probe);

    private async void OnDisconnect(object sender, RoutedEventArgs e)
    {
        // Asks first, as the phone does. It hands the charge decision back to
        // the socket and drops the link - a real consequence to arrive at by way
        // of a stray click near the corner of the window.
        //
        // It names the consequence rather than asking "are you sure?", because
        // the thing worth knowing is not that something is about to happen but
        // what: the socket carries on by itself, and the part that stops is this
        // machine's own charge limit.
        var confirm = AppDialog.Confirm(
            this,
            "Disconnect?",
            "The socket keeps cutting power on its own. This app stops watching " +
            "this laptop's battery, so it will no longer tell the socket when to " +
            "stop charging it.",
            confirmText: "DISCONNECT",
            danger: true);

        if (!confirm) return;

        // Give the socket its own judgement back before dropping the link, so it
        // is never left with nothing watching the charge. A link that dies on
        // its own cannot do this, which is exactly why the claim also expires on
        // a timer.
        await Battery.HandBackAsync();

        // Hanging up is a decision, and it has to survive a restart too -
        // otherwise the app would reconnect on launch to a socket the user
        // deliberately walked away from.
        Settings.LastPort = null;
        Settings.Save();

        Repo.Disconnect();
        RefreshPorts();
        ShowView(View.Connect);
    }

    private void OnLimitChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (_loading) return;

        var limit = (int)e.NewValue;
        Battery.SetLimit(limit);
        LimitLabel.Text = $"Charge to {Settings.BatteryLimit}%, back on at {Settings.ResumeAt}%";
        RenderBattery();
    }

    private void OnCutOnLimitChanged(object sender, RoutedEventArgs e)
    {
        if (_loading) return;
        Battery.SetCutOnLimit(CutOnLimitBox.IsChecked == true);
        RenderBattery();

        // CUTS AT changes meaning with this switch, so it has to be redrawn now
        // rather than waiting for the next status line a second later.
        RenderStatus(Repo.Status);
    }

    // --- history --------------------------------------------------------------

    private void OnOpenHistory(object sender, RoutedEventArgs e)
    {
        RenderHistory();
        ShowView(View.History);
    }

    private void OnCloseHistory(object sender, RoutedEventArgs e) =>
        ShowView(Repo.IsConnected ? View.Dashboard : View.Connect);

    private void OnClearHistory(object sender, RoutedEventArgs e)
    {
        // Word for word what the phone asks.
        var answer = AppDialog.Confirm(
            this,
            "Clear history?",
            "Every recorded charge is deleted, and the socket's own lifetime " +
            "cutoff count and saved time are reset to zero. This cannot be undone.",
            confirmText: "CLEAR",
            danger: true);

        if (!answer) return;

        Repo.History.Clear();

        // The totals live in the socket's EEPROM, not here. Clearing only this
        // app's list left them on screen unchanged and looking stuck.
        if (Repo.IsConnected) _ = Repo.SendAsync(SocketCommand.ResetTotals);
    }

    private void OnExport(object sender, RoutedEventArgs e)
    {
        if (Repo.History.Sessions.Count == 0)
        {
            AppDialog.Tell(this, "Nothing to export",
                "Charges appear here once the socket has cut power at least once.");
            return;
        }

        var dialog = new Microsoft.Win32.SaveFileDialog
        {
            FileName = HistoryCsv.FileName,
            DefaultExt = ".csv",
            Filter = "Comma-separated values (*.csv)|*.csv",
        };

        if (dialog.ShowDialog() != true) return;

        try
        {
            File.WriteAllText(dialog.FileName, Repo.History.ToCsv());
        }
        catch (Exception ex)
        {
            AppDialog.Warn(this, "Could not write the file", ex.Message);
        }
    }
}
