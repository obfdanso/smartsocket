import { FieldLabel, GoldButton, Hairline, LogoMark, Wordmark } from './components'

/**
 * Choose a socket.
 *
 * THE BROWSER OWNS THE DEVICE LIST, which is the one place this screen cannot
 * copy the phone. Web Bluetooth gives a page no way to scan or enumerate - any
 * site could otherwise inventory the radios around you - so `requestDevice`
 * hands the job to Chrome's own chooser and the page is given exactly one
 * device back.
 *
 * That removes the phone's "Devices found (41)" disclosure entirely. It also
 * removes the reason it existed: the browser's list is the one being scrolled,
 * and it is already sorted and searchable. Everything else on the screen - the
 * wordmark, the mark, the heading, the demo below the rule - is unchanged.
 */
export function ConnectScreen({
  supported,
  searching,
  onSearch,
  onDemo,
}: {
  supported: boolean
  searching: boolean
  onSearch: () => void
  onDemo: () => void
}) {
  return (
    <>
      <Wordmark />
      <div style={{ height: 14 }} />
      <Hairline />
      <div style={{ height: 32 }} />

      <LogoMark size={132} />

      <div style={{ height: 32 }} />

      <h1 className="headline">Choose a socket</h1>
      <div style={{ height: 12 }} />

      {supported ? (
        <>
          <p className="body">
            Your browser asks which device to use. Power the socket up, tap Search, and
            pick it from the list — a Bluetooth LE module never appears in your
            Bluetooth settings, so this is the only place it can show up.
          </p>
          <div style={{ height: 16 }} />
          <GoldButton onClick={onSearch} disabled={searching}>
            {searching ? 'SEARCHING…' : 'SEARCH'}
          </GoldButton>
        </>
      ) : (
        /*
          Said plainly rather than hidden. Safari and Firefox have both declined
          to implement Web Bluetooth, so on those there is no route to the
          socket at all and no amount of retrying will produce one. The demo
          below still works everywhere, which is why it is not gated on this.
        */
        <p className="body">
          This browser cannot talk to Bluetooth devices. Chrome or Edge, on Android or
          a computer, can — Safari and Firefox do not support it at all. You can still
          run the demo below.
        </p>
      )}

      <div style={{ height: 32 }} />
      <Hairline />
      <div style={{ height: 20 }} />

      {/* Present from the start, not hidden behind a debug flag: the socket is
          a physical object that may be in another room, and the app should
          still be worth opening. */}
      <FieldLabel>No hardware to hand</FieldLabel>
      <div style={{ height: 14 }} />
      <GoldButton onClick={onDemo}>RUN</GoldButton>
    </>
  )
}

/** Shown while the socket is being reached. */
export function ConnectingScreen({ name }: { name: string }) {
  return (
    <div className="center-screen">
      <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
        <svg className="spin" width={172} height={172} viewBox="0 0 172 172" aria-hidden>
          <circle cx="86" cy="86" r="83" fill="none" stroke="var(--gold-faint)" strokeWidth="6" />
          <circle
            cx="86"
            cy="86"
            r="83"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="150 371"
          />
        </svg>
        <div style={{ position: 'absolute' }}>
          <LogoMark size={116} />
        </div>
      </div>
      <div className="title" style={{ marginTop: 28 }}>
        Connecting
      </div>
      <p className="body" style={{ marginTop: 6 }}>
        {name}
      </p>
    </div>
  )
}
