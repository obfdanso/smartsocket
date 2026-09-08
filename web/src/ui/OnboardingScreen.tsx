import { useState } from 'react'
import { GoldButton, LogoMark } from './components'

/** Word for word what the phone shows. */
const PAGES = [
  {
    kicker: 'What it does',
    title: ['It stops charging', "when you're full"],
    body:
      'Leaving a laptop on the charger at 100% wears the battery down. This ' +
      'socket watches the current, notices when charging tapers off, and cuts ' +
      'the wall.',
  },
  {
    kicker: 'No buttons needed',
    title: ['It looks again', 'on its own'],
    body:
      'After cutting, the socket checks every so often to see whether something ' +
      'new is plugged in, or whether your battery has drained. It comes back by ' +
      'itself.',
  },
  {
    kicker: 'Your phone helps',
    title: ['Set a charge limit'],
    body:
      "The socket can't see a phone charging — the current is too small to " +
      'measure. But your phone knows its own battery, so it can tell the socket ' +
      'when to stop.',
  },
]

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const page = PAGES[index]
  const last = index === PAGES.length - 1

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="row">
        <LogoMark size={44} />
        <button
          className="btn-outline"
          style={{ border: 0, color: 'var(--muted)', height: 44 }}
          onClick={onDone}
        >
          Skip
        </button>
      </div>

      {/*
        The text sits in the middle of what is left. It used to be pinned under
        the header with a single weighted spacer below it, which on a tall
        screen left roughly a third of the page visibly, obviously empty.
      */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="label" style={{ color: 'var(--gold)' }}>
          {page.kicker}
        </div>
        <h1 className="headline" style={{ marginTop: 18 }}>
          {page.title.map((line) => (
            <span key={line} style={{ display: 'block' }}>
              {line}
            </span>
          ))}
        </h1>
        <p className="body" style={{ marginTop: 18, fontSize: 16 }}>
          {page.body}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {PAGES.map((p, i) => (
          <span
            key={p.kicker}
            style={{
              height: 6,
              width: i === index ? 26 : 6,
              borderRadius: 3,
              background: i === index ? 'var(--gold)' : 'var(--surface3)',
              transition: 'width 200ms ease',
            }}
          />
        ))}
      </div>

      <GoldButton onClick={() => (last ? onDone() : setIndex(index + 1))}>
        {last ? 'Get started' : 'Next'}
      </GoldButton>
    </div>
  )
}
