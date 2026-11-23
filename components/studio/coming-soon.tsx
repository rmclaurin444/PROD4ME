import Link from 'next/link'
import { ArrowLeft, AudioLines, ListMusic, Sliders, Sparkles } from 'lucide-react'

const FEATURES = [
  {
    icon: ListMusic,
    title: 'Multitrack recording',
    text: 'Layer vocal takes over any beat in the catalog.',
  },
  {
    icon: Sliders,
    title: 'Mixing',
    text: 'Volume, panning, mute and solo on every track.',
  },
  {
    icon: Sparkles,
    title: 'Effects',
    text: 'Auto-Tune, compression, EQ and reverb inserts.',
  },
]

/** Shown to every role while the Studio flag (NEXT_PUBLIC_STUDIO_ENABLED) is
 *  off. Uses the same page shell styling as the rest of the app. */
export function ComingSoon() {
  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-background/60 px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-bold text-muted-foreground hover:text-brand"
        >
          <ArrowLeft size={16} />
          Back to Feed
        </Link>
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-md bg-brand text-brand-foreground">
            <AudioLines size={14} />
          </div>
          <span className="text-sm font-black uppercase tracking-widest text-brand">
            Studio
          </span>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl rounded-3xl border border-border bg-surface p-10 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/15 text-brand">
            <AudioLines size={26} />
          </div>
          <h1 className="mt-5 text-3xl font-black tracking-tighter sm:text-4xl">
            Studio is coming soon
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Record, engineer, and mix on PROD4ME beats, right in the app.
          </p>

          <ul className="mt-8 space-y-3 text-left">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex items-start gap-3 rounded-2xl border border-border/50 bg-surface px-4 py-3"
              >
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
                  <Icon size={15} />
                </span>
                <span>
                  <span className="block text-sm font-black">{title}</span>
                  <span className="block text-xs text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>

          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-black text-brand-foreground hover:bg-brand/90"
          >
            <ArrowLeft size={16} />
            Back to Feed
          </Link>
        </div>
      </div>
    </main>
  )
}
