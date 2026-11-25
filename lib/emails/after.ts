import { after } from 'next/server'

/**
 * Runs `task` after the response has been sent (next/server `after`), so a
 * transactional email never delays or fails the action that triggered it.
 * Outside a request scope (scripts) it runs right away. Errors are logged.
 *
 * Kept separate from lib/emails/send.ts so the dispatch code has no Next.js
 * import and can be exercised by plain-Node tests (scripts/emails.test.ts).
 */
export function afterResponse(task: () => Promise<unknown>): void {
  const run = () =>
    task().catch(error => {
      console.error('Transactional email task failed:', error)
    })
  try {
    after(run)
  } catch {
    void run()
  }
}
