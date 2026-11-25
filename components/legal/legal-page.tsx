import Link from 'next/link'
import { Zap } from 'lucide-react'

export type LegalSection = {
  id: string
  title: string
  body: string[]
}

/**
 * Shared layout for /terms and /privacy. The text is PLACEHOLDER content —
 * every section carries a visible "TODO: review" marker until the owner
 * replaces it with reviewed legal text.
 */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string
  updated: string
  intro: string
  sections: LegalSection[]
}) {
  return (
    <main className="min-h-screen bg-background px-5 py-12 text-foreground">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/" className="mb-10 inline-flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-brand text-brand-foreground">
            <Zap size={18} fill="currentColor" />
          </span>
          <span className="text-xl font-black tracking-tighter">
            PROD<span className="text-brand">4</span>ME
          </span>
        </Link>

        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        <p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Last updated {updated}
        </p>
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{intro}</p>

        <nav aria-label="Sections" className="mt-8 rounded-2xl border border-border bg-surface p-5">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {sections.map(section => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="font-semibold hover:underline">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-8">
              <h2 className="text-lg font-black">
                {index + 1}. {section.title}
              </h2>
              <p className="mt-1 inline-block rounded-md border border-border bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                TODO: review
              </p>
              {section.body.map((paragraph, i) => (
                <p key={i} className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <footer className="mt-16 flex flex-wrap gap-4 border-t border-border pt-6 text-xs font-bold text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/" className="hover:text-foreground">
            Back to PROD4ME
          </Link>
        </footer>
      </div>
    </main>
  )
}
