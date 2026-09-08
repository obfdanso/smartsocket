import { useState } from 'react'
import { peakAmps, taperFraction, type ChargeSession } from '../data/history'
import { Dialog, FieldLabel, OutlineButton, Panel, Stat } from './components'

const formatShort = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000)
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m`
  return `${Math.floor(ms / 1000)}s`
}

const stamp = (ms: number): string => {
  const d = new Date(ms)
  const month = d.toLocaleString('en-GB', { month: 'short' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${d.getDate()} ${month} · ${time}`
}

export function HistoryScreen({
  sessions,
  onBack,
  onClear,
  onExport,
}: {
  sessions: ChargeSession[]
  onBack: () => void
  onClear: () => void
  onExport: () => void
}) {
  const [confirmClear, setConfirmClear] = useState(false)

  /*
    NOTHING RECORDED IS ITS OWN SCREEN, CENTRED.

    It used to be the same top-aligned layout with the list simply missing,
    which left one grey sentence in the corner above a screenful of nothing -
    indistinguishable from a screen that had failed to load.
  */
  if (sessions.length === 0) {
    return (
      <div className="center-screen">
        <h1 className="headline">History</h1>
        <p className="body" style={{ marginTop: 10, maxWidth: 320 }}>
          Charges appear here once the socket has cut power at least once.
        </p>
        <div style={{ height: 24 }} />
        <OutlineButton onClick={onBack}>Back</OutlineButton>
      </div>
    )
  }

  const chart = sessions.slice(0, 20).reverse()
  const maxMa = Math.max(1, ...chart.map((s) => s.peakMa))

  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
        <OutlineButton dense tint="var(--gold)" onClick={onExport}>
          Export
        </OutlineButton>
        {/* Alarm, like Disconnect, because it is the same kind of act: it throws
            away every charge recorded and zeroes the socket's own totals. */}
        <OutlineButton dense tint="var(--alarm)" onClick={() => setConfirmClear(true)}>
          Clear
        </OutlineButton>
      </div>

      <div style={{ height: 24 }} />

      <h1 className="headline">History</h1>
      <p className="body" style={{ marginTop: 6 }}>
        {sessions.length} {sessions.length === 1 ? 'charge' : 'charges'} recorded
      </p>

      <div style={{ height: 24 }} />

      <Panel>
        <FieldLabel>Peak current per charge</FieldLabel>
        <div style={{ height: 18 }} />

        {/*
          Bars, not a line. Each charge is a discrete event, not a sample of
          something continuous, and a line drawn between them implies values in
          the gaps that were never measured.
        */}
        <div
          className="chart"
          style={{ display: 'flex', alignItems: 'flex-end', gap: '2%', height: 120 }}
        >
          {chart.map((s, i) => (
            <div
              key={s.endedAtMillis + '-' + i}
              style={{
                flex: 1,
                height: '100%',
                display: 'flex',
                alignItems: 'flex-end',
                // Faint full-height track, so short bars still read as "short"
                // rather than as missing.
                background: 'var(--surface3)',
                borderRadius: 999,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: `${Math.max(2, (s.peakMa / maxMa) * 100)}%`,
                  borderRadius: 999,
                  background: i === chart.length - 1 ? 'var(--gold-light)' : 'var(--gold)',
                }}
              />
            </div>
          ))}
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <span className="label">oldest</span>
          <span className="label">newest</span>
        </div>
      </Panel>

      <div style={{ height: 16 }} />

      <div className="history-list">
        {sessions.map((s, i) => (
          <Panel key={s.endedAtMillis + '-' + i}>
            <div className="row">
              <span className="title">{stamp(s.endedAtMillis)}</span>
              <span className="body" style={{ color: 'var(--gold)' }}>
                {peakAmps(s).toFixed(2)} A peak
              </span>
            </div>
            <div style={{ height: 14 }} />
            <div className="stats">
              <Stat label="Charged for" value={formatShort(s.durationMs)} />
              <Stat label="Cut at" value={`${(s.cutAtMa / 1000).toFixed(2)} A`} />
              <Stat label="Taper" value={`${Math.trunc(taperFraction(s) * 100)}%`} />
            </div>
          </Panel>
        ))}
      </div>

      <div style={{ height: 16 }} />
      <OutlineButton onClick={onBack}>Back</OutlineButton>
      <div style={{ height: 24 }} />

      {confirmClear && (
        <Dialog
          title="Clear history?"
          body={
            "Every recorded charge is deleted, and the socket's own lifetime cutoff " +
            'count and saved time are reset to zero. This cannot be undone.'
          }
          confirmText="CLEAR"
          cancelText="CANCEL"
          danger
          onConfirm={() => {
            setConfirmClear(false)
            onClear()
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </>
  )
}
