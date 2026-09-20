import { Zap } from 'lucide-react'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-md bg-lime-300 text-black">
              <Zap size={20} fill="currentColor" />
            </div>
            <span className="text-2xl font-black tracking-tighter">
              PROD<span className="text-lime-300">4</span>ME
            </span>
          </div>
        </div>
        {children}
      </div>
    </main>
  )
}
