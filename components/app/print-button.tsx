'use client'

import { Printer } from 'lucide-react'

/** Opens the browser's print dialog (print or save as PDF). Hidden when printing. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-black text-brand-foreground print:hidden"
    >
      <Printer size={16} /> Print or save as PDF
    </button>
  )
}
