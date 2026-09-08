import type { CSSProperties, ReactNode } from 'react'

/** The SS monogram. The app's mark, and the favicon's. */
export function LogoMark({ size = 132 }: { size?: number }) {
  return (
    <img
      className="logo"
      src="/logo_mark.png"
      alt="Smart Socket"
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  )
}

/**
 * The name, letterspaced to match the mark.
 *
 * The tracking is the point: it is the same wide setting the monogram's own
 * "SMART SOCKET" carries, which ties a bare line of text to the logo without
 * repeating it.
 */
export const Wordmark = () => <div className="wordmark">S M A R T &nbsp;&nbsp;S O C K E T</div>

export const Hairline = () => <hr className="hairline" />

export const FieldLabel = ({ children }: { children: ReactNode }) => (
  <div className="label">{children}</div>
)

/** A raised panel. The one container used everywhere, so nothing drifts. */
export function Panel({
  children,
  accent = false,
  style,
}: {
  children: ReactNode
  accent?: boolean
  style?: CSSProperties
}) {
  return (
    <div className={accent ? 'panel accent' : 'panel'} style={style}>
      {children}
    </div>
  )
}

/** Status pill: a dot and a word. */
export function StatePill({ label, tint }: { label: string; tint: string }) {
  return (
    <span
      className="pill"
      style={{
        color: tint,
        background: `color-mix(in srgb, ${tint} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${tint} 35%, transparent)`,
      }}
    >
      <span className="dot" />
      {label}
    </span>
  )
}

/** Primary action. Solid gold, dark text. */
export function GoldButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button className="btn-gold" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/** Secondary action. Outline only, so it never competes with the gold. */
export function OutlineButton({
  children,
  onClick,
  disabled,
  tint,
  dense = false,
  full = false,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  tint?: string
  dense?: boolean
  full?: boolean
}) {
  const colour = disabled ? 'var(--faint)' : (tint ?? 'var(--bone)')

  return (
    <button
      className={dense ? 'btn-outline btn-chip' : 'btn-outline'}
      onClick={onClick}
      disabled={disabled}
      style={{
        color: colour,
        // A chip carries its own colour on the border; a full-width button
        // keeps the neutral edge so it yields to the gold one.
        borderColor: disabled
          ? 'var(--surface2)'
          : dense && tint
            ? `color-mix(in srgb, ${tint} 55%, transparent)`
            : 'var(--surface3)',
        width: full ? '100%' : undefined,
      }}
    >
      {children}
    </button>
  )
}

/** A labelled value in a row of statistics. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="title" style={{ marginTop: 6 }}>
        {value}
      </div>
    </div>
  )
}

/**
 * The app's own modal.
 *
 * It names the consequence rather than asking "are you sure?", because the
 * thing worth knowing is not that something is about to happen but what. The
 * destructive choice wears the alarm colour so it has to be aimed at, rather
 * than being the one a thumb lands on.
 */
export function Dialog({
  title,
  body,
  confirmText,
  cancelText,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmText: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="scrim"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      onKeyDown={(e) => {
        // Escape cancels, as it does in every other dialog on the machine.
        if (e.key === 'Escape') onCancel()
      }}
    >
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ color: danger ? 'var(--alarm)' : 'var(--bone)' }}>{title}</h2>
        <p className="body" style={{ marginTop: 12 }}>
          {body}
        </p>
        <div className="actions">
          {cancelText && (
            <OutlineButton dense tint="var(--muted)" onClick={onCancel}>
              {cancelText}
            </OutlineButton>
          )}
          <OutlineButton
            dense
            tint={danger ? 'var(--alarm)' : 'var(--gold)'}
            onClick={onConfirm}
          >
            {confirmText}
          </OutlineButton>
        </div>
      </div>
    </div>
  )
}
