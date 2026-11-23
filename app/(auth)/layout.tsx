import { Zap } from 'lucide-react'
import { ThemeToggleCompact } from '@/components/app/theme-toggle'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-5 py-12">
      {/* mode switch: top right of every auth page */}
      <div className="absolute right-5 top-5">
        <ThemeToggleCompact variant="plain" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-md bg-brand text-brand-foreground">
              <Zap size={20} fill="currentColor" />
            </div>
            <span className="text-2xl font-black tracking-tighter">
              PROD<span className="text-brand">4</span>ME
            </span>
          </div>
        </div>
        {children}
      </div>
    </main>
  )
}
