using SmartSocket.Core;

namespace SmartSocket.App.Transport;

/// <summary>
/// The socket's state machine in software, so every screen can be built and
/// demonstrated with no hardware in the room.
///
/// A LINE-FOR-LINE PORT OF THE ANDROID APP'S MockTransport. The two demos used
/// to disagree about the thing they were both demonstrating: this one ran a
/// whole charge in about a minute, on a 700 ms tick, and then ping-ponged
/// between Cutoff and Probing for as long as anyone left it open. Two clients
/// showing the same socket behaving differently is worse than either of them
/// being wrong on its own, because it makes the socket look like the unreliable
/// part.
///
/// **It runs once and stops.** One charge, watched to its end, is what the
/// product actually does - and the counters no longer climb to numbers no real
/// socket would reach in a day.
///
/// Timings are chosen so a full run lasts about half an hour. Nothing here is a
/// claim about the real device's timing; the firmware's <c>Config.h</c> is the
/// authority on that.
/// </summary>
public sealed class MockTransport : ISocketTransport
{
    /// <summary>Once a second, which is what the firmware's telemetry does.</summary>
    private static readonly TimeSpan Tick = TimeSpan.FromSeconds(1);

    private const int ReadySeconds = 60;
    private const int SettlingSeconds = 60;
    private const int ChargingSeconds = 1400;
    private const int CutoffSeconds = 240;

    /// <summary>Where the plateau ends and the taper begins, as a fraction of the charge.</summary>
    private const double KneeAt = 0.55;

    private const int PlateauMa = 150;
    private const int TrickleMa = 66;
    private const int ThresholdMa = 100;

    private CancellationTokenSource? _cts;

    private SocketState _state = SocketState.Ready;
    private int _currentMa;
    private int _peakMa;
    private int _thresholdMa;
    private long _elapsedMs;

    /// <summary>
    /// Carried across restarts rather than held inside the script, so a re-arm
    /// continues the socket's life instead of resetting its totals.
    /// </summary>
    private int _cutoffs;
    private long _savedMs;

    public event Action<LinkState>? LinkStateChanged;
    public event Action<SocketStatus>? StatusChanged;

    public Task<bool> ConnectAsync(SocketDevice device, CancellationToken ct = default)
    {
        Disconnect();

        LinkStateChanged?.Invoke(new LinkState.Connecting());

        _cutoffs = 0;
        _savedMs = 0;

        LinkStateChanged?.Invoke(new LinkState.Connected(device));
        Restart(fromCharging: false);

        return Task.FromResult(true);
    }

    /// <summary>
    /// Accepted and ignored. The demo has no display to update and no charge
    /// policy to hand over, so A, B, T and L lines have nothing to do here.
    /// </summary>
    public Task SendLineAsync(string line) => Task.CompletedTask;

    /// <summary>
    /// THE BUTTONS TAKE THE SOCKET OVER, and the script lets go.
    ///
    /// A command now stops the script, exactly as a command to the real socket
    /// overrides what it was going to do next.
    /// </summary>
    public Task SendAsync(SocketCommand command)
    {
        switch (command)
        {
            case SocketCommand.Cut:
                if (_state.IsPowerOn())
                {
                    StopScript();
                    // Counted, because it is a real cutoff: the lifetime total
                    // has to match what the person watching just saw happen.
                    _cutoffs++;
                    _state = SocketState.Cutoff;
                    _currentMa = 0;
                    _peakMa = 0;
                    Publish();
                }
                break;

            case SocketCommand.Rearm:
                if (_state == SocketState.Cutoff || _state.IsAlarm())
                {
                    _state = SocketState.Ready;
                    Publish();
                    // Straight back to charging. Sitting through another minute
                    // of "waiting for something to be plugged in" is not what
                    // somebody who just pressed Re-arm is asking for.
                    Restart(fromCharging: true);
                }
                break;

            case SocketCommand.Probe:
                if (_state == SocketState.Cutoff)
                {
                    _state = SocketState.Probing;
                    Publish();
                    Restart(fromCharging: true);
                }
                break;

            case SocketCommand.StatusNow:
                Publish();
                break;

            case SocketCommand.ResetTotals:
                _cutoffs = 0;
                _savedMs = 0;
                Publish();
                break;
        }

        return Task.CompletedTask;
    }

    public void Disconnect()
    {
        StopScript();
        _cutoffs = 0;
        _savedMs = 0;
        LinkStateChanged?.Invoke(new LinkState.Idle());
    }

    private void StopScript()
    {
        try { _cts?.Cancel(); } catch (Exception) { /* already gone */ }
        _cts?.Dispose();
        _cts = null;
    }

    private void Restart(bool fromCharging)
    {
        StopScript();
        _cts = new CancellationTokenSource();
        var token = _cts.Token;
        _ = Task.Run(() => RunAsync(fromCharging, token), CancellationToken.None);
    }

    /// <summary>
    /// One charge, start to finish, then it stays cut.
    ///
    /// Deliberately no probe-and-resume at the end. Probing is what leads back
    /// into charging, and a demo that returns to the beginning on its own is the
    /// looping this was written to stop.
    /// </summary>
    private async Task RunAsync(bool fromCharging, CancellationToken ct)
    {
        try
        {
            if (!fromCharging)
            {
                for (var i = 0; i < ReadySeconds; i++)
                {
                    Emit(SocketState.Ready, currentMa: 0);
                    await Task.Delay(Tick, ct).ConfigureAwait(false);
                }
            }

            for (var i = 0; i < SettlingSeconds; i++)
            {
                Emit(SocketState.Settling, currentMa: PlateauMa + 5);
                await Task.Delay(Tick, ct).ConfigureAwait(false);
            }

            var peak = 0;
            for (var second = 0; second < ChargingSeconds; second++)
            {
                var ma = ChargeCurrentMa(second);
                if (ma > peak) peak = ma;

                Emit(
                    SocketState.Charging,
                    currentMa: ma,
                    peakMa: peak,
                    thresholdMa: ThresholdMa,
                    elapsedMs: second * 1000L);

                await Task.Delay(Tick, ct).ConfigureAwait(false);
            }

            _cutoffs++;
            Emit(SocketState.Cutoff, currentMa: 0);

            // Sit cut, accumulating the time the wall was off, and then simply
            // stop. The buttons still work: the socket is left where a real one
            // would be, waiting for somebody to re-arm it.
            for (var i = 0; i < CutoffSeconds; i++)
            {
                _savedMs += (long)Tick.TotalMilliseconds;
                Emit(SocketState.Cutoff, currentMa: 0);
                await Task.Delay(Tick, ct).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            // A button took over, or the link was dropped. Either way this
            // script is no longer the thing driving the socket.
        }
    }

    /// <summary>
    /// A charger's current over time: a long plateau, a knee, then a decaying
    /// tail toward the trickle.
    ///
    /// Exponential rather than the old fixed 7%-per-tick decay, because that is
    /// the shape the real thing makes - steep at the knee and flattening out,
    /// which is exactly why the firmware needs a confirmation window rather than
    /// a single reading below the threshold.
    /// </summary>
    private static int ChargeCurrentMa(int second)
    {
        var t = (double)second / ChargingSeconds;

        if (t < KneeAt)
        {
            // Not flat: a real reading jitters by a count or two, and a
            // perfectly constant number looks like a frozen screen.
            return PlateauMa + (second % 7) - 3;
        }

        var k = (t - KneeAt) / (1 - KneeAt);
        var span = (double)(PlateauMa - TrickleMa);
        return (int)Math.Round(TrickleMa + span * Math.Exp(-3 * k));
    }

    private void Emit(
        SocketState state,
        int currentMa,
        int peakMa = 0,
        int thresholdMa = 0,
        long elapsedMs = 0)
    {
        _state = state;
        _currentMa = currentMa;
        _peakMa = peakMa;
        _thresholdMa = thresholdMa;
        _elapsedMs = elapsedMs;
        Publish();
    }

    private void Publish() => StatusChanged?.Invoke(new SocketStatus(
        State: _state,
        CurrentMa: _currentMa,
        PeakMa: _peakMa,
        ThresholdMa: _thresholdMa,
        SessionElapsedMs: _elapsedMs,
        CutoffCount: _cutoffs,
        TotalSavedMs: _savedMs,
        RelayClosed: _state.IsPowerOn()));
}
