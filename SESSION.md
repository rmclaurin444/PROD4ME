# PROD4ME — Session Notes

**Date:** 2026-09-16
**Branch:** `loginndstuff`
**Status:** Login + account creation with role selection — **complete and verified**. UI engagement polish — **complete**. Awaiting next user stories.

---

## Project Overview

PROD4ME is a beat marketplace (TikTok-style vertical feed) with two fixed user roles:
- **Producer** — uploads beats, dashboard, negotiates offers
- **Artist** — discovers beats, saves, links finished tracks

Originally a v0.app-generated clickable prototype: single monolithic `app/page.tsx`, all data hardcoded, no backend/auth/database.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.3.3 (App Router, Turbopack) |
| Language | TypeScript 5.7.3 (strict) |
| UI | React 19, Tailwind CSS 4, shadcn/ui (base-nova, `@base-ui/react`) |
| Icons | lucide-react |
| Database | PostgreSQL 18 (local) via **Prisma 6.19.3** |
| Auth | **Auth.js v5** (`next-auth@5.0.0-beta.32`), credentials provider, **JWT sessions** |
| Password hashing | bcryptjs |
| Package manager | pnpm 12.4.2 |

---

## Completed Work

### Story 1 — Account creation with fixed role

> As a user, I want to choose either Producer or Artist when creating my account so that my role is fixed and the app shows the right tools for me.

**Subtasks — all done:**

1. ✅ Sign-up form with role selection step
2. ✅ In-app mode toggle removed, replaced by role-based rendering
3. ✅ Nav + screen rendering wired to account's fixed role
4. ✅ Validation preventing account creation without a role

### UI polish (follow-up request)

5. ✅ Share button made fully functional
6. ✅ TikTok-style engagement counts (likes / comments / shares) under each icon

---

## File Structure (new/changed)

```
app/
  layout.tsx                       MODIFIED — wraps children in <Providers> (SessionProvider)
  page.tsx                         REWRITTEN — server component, reads session, loads user, renders <AppShell>
  (auth)/
    layout.tsx                     centered auth layout (no sidebar)
    login/page.tsx                 login form
    signup/page.tsx                2-step: details -> role selection
  api/auth/
    [...nextauth]/route.ts         Auth.js handlers (GET/POST)
    register/route.ts              registration endpoint (validation + bcrypt)

components/
  providers.tsx                    client wrapper for SessionProvider
  app/
    data.ts                        beats, themes, getInitials(), formatCount()
    ui.tsx                         Avatar, TagPills
    nav.ts                         getNav(isArtist) — role-based nav config
    sidebar.tsx                    Sidebar + MobileNav (role-aware, mode toggle REMOVED)
    header.tsx                     search + fixed role badge (toggle REMOVED)
    feed.tsx                       beat feed + ActionButton rail with counts
    upload.tsx                     UploadView
    dashboard.tsx                  Dashboard (greets session user)
    profiles.tsx                   ProducerProfile + ArtistProfile
    inbox.tsx                      InboxView + UserProfile
    modals.tsx                     Comments, PostTrack, Offer
    edit-profile.tsx               EditProfile modal
    app-shell.tsx                  main client component — holds ALL state

lib/
  prisma.ts                        Prisma client singleton
  auth.ts                          full Auth.js config (credentials + Prisma + bcrypt)
  auth.config.ts                   edge-safe config for proxy (no Prisma/bcrypt)

prisma/
  schema.prisma                    User model + Role enum
  migrations/20260916045953_init/  initial migration

types/next-auth.d.ts               type augmentation: Session/JWT carry id + role
proxy.ts                           route protection (Next 16 middleware replacement)
.env                               DATABASE_URL + AUTH_SECRET  (gitignored)
```

---

## Database

- Database name: `prod4me` (local PostgreSQL 18, port 5432, user `postgres`)
- Prisma schema:

```prisma
enum Role { PRODUCER ARTIST }

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  name      String
  role      Role
  bio       String?
  avatar    String?
  banner    String?
  theme     String?  @default("acid")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- `.env` (gitignored):
```
DATABASE_URL="postgresql://postgres:<PASSWORD>@localhost:5432/prod4me"
AUTH_SECRET="dev-secret-change-me-in-production"
```
⚠️ `AUTH_SECRET` is a dev placeholder — regenerate before deploying (`openssl rand -base64 32`).

---

## Architecture Decisions

1. **JWT sessions, not database sessions** — credentials provider requires JWT; no Session table needed. Session cookie carries `id` + `role`.
2. **Split auth config** — `auth.config.ts` is edge-safe (no Prisma/bcrypt) so `proxy.ts` can import it; `auth.ts` spreads it and adds the Credentials provider.
3. **Server component page** — `app/page.tsx` is a server component that reads the session and fetches the full user from DB, then passes it into the client `<AppShell>`. All interactive state lives in `AppShell`.
4. **Single profile state** — role is fixed, so the old dual state (`theme`/`artistTheme`, `banner`/`artistBanner`, `bio`/`artistBio`) collapsed into one set seeded from the DB.
5. **Unified `profile` view** — the old separate `'artist'` view was removed; `view === 'profile'` renders Producer or Artist profile based on role.

---

## Setup Gotchas (important for future sessions)

1. **Next.js 16 renamed `middleware.ts` → `proxy.ts`.** Must export a *function* (default export). Use `export default NextAuth(authConfig).auth`. The old `middleware.ts` will fail the build.
2. **Don't install plain `prisma`/`@prisma/client`** — it resolves to Prisma 8 RC with a completely redesigned CLI (`prisma orm`, `prisma contract`, `prisma db`) and a client/CLI version mismatch. Pin to `prisma@6 @prisma/client@6`.
3. **pnpm blocks build scripts.** `pnpm-workspace.yaml` needs `allowBuilds` entries (`esbuild`, `msgpackr-extract`, `workerd`, `@prisma/client`, `@prisma/engines`, `prisma`). `pnpm approve-builds` is interactive and fails in non-TTY.
4. **`pnpm` is a .ps1 script** — can't be launched via `Start-Process -FilePath pnpm`; use `cmd.exe /c pnpm dev > dev.log 2>&1`.
5. **PostgreSQL wouldn't start** — stale `postmaster.pid` after repeated improper shutdowns, plus very long recovery (>220s) exceeding the Windows service timeout. Fixed by a full uninstall/reinstall of PostgreSQL.
6. **`.gitignore`** — `.env` added (was only `.env*.local`). Also ignores `tsconfig.tsbuildinfo`, `dev.log`, `dev.err.log`.

---

## Verification Results

| Test | Result |
|---|---|
| Register without role | Rejected — "You must select a role: Producer or Artist" |
| Register PRODUCER / ARTIST | Created with correct role |
| Duplicate email | Rejected |
| Password < 8 chars | Rejected |
| Login (correct creds) | Session includes `role` |
| Login (wrong password) | No session |
| `/` unauthenticated | 307 → `/login` |
| `/login` authenticated | Redirect → `/` |
| Producer nav | Discover, Upload beat, Dashboard, Inbox, Profile |
| Artist nav | Discover, Inbox, Artist profile (no Upload/Dashboard) |
| Mode toggle | Absent from DOM |
| Feed counts | Renders 12.4K likes / 9 comments / 1.8K saves / 320 shares |
| Artist offer button | Present only for ARTIST |
| `tsc --noEmit` | Clean |
| `pnpm build` | Succeeds |

---

## Test Accounts (password: `password123`)

| Email | Role |
|---|---|
| `producer@test.com` | PRODUCER |
| `artist@test.com` | ARTIST |

*These were created during testing — delete them when no longer needed.*

---

## Current Runtime State

- PostgreSQL service: **running**
- Dev server: **running** at http://localhost:3000
- Dependency install command: `pnpm add prisma@6 @prisma/client@6 next-auth@beta bcryptjs`

---

## Not Yet Persisted to DB (known gaps)

These work in-memory but are NOT saved to the database yet:
- Profile edits (bio / theme / banner) — local state only
- Likes, saves, shares, comments — local state only
- Beat uploads, tracks, offers, messages — still mock/UI-only

Relevant DB columns already exist (`bio`, `banner`, `theme`) for profile persistence when needed.

---

## Next Steps

**User has 2 more user stories to provide.** Awaiting them before continuing.

When resuming:
1. Read this file
2. Confirm dev server + PostgreSQL are running
3. Ask for the next user stories
4. Continue on branch `loginndstuff`
