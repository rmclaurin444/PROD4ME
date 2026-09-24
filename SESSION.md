# PROD4ME — Session Notes

**Date:** 2026-09-16 (updated 2026-09-23)
**Branch:** `loginndstuff`
**Status:** Story 1 (login + account creation with role) — **complete**. UI engagement polish — **complete**. Story 2 (beat upload with MinIO) — **complete and verified**. Story 3 (SoundCloud-style waveform) — **code complete, `tsc --noEmit` clean; end-to-end browser verification and `pnpm build` still outstanding**. Audio playback added to feed. pnpm store corruption fixed — local Prisma CLI working.

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

### Story 3 — SoundCloud-style waveform (code complete, 2026-09-23)

> As a user, I want to see a visual waveform that mirrors the actual audio file's amplitude as I browse beats so that I can see the structure and dynamics of a beat at a glance and scrub through it to preview sections.

**Steps completed:**

1. ✅ Database: `peaks` JSONB column added to `Beat` model (migration `20260921173411_add_beat_peaks`)
2. ✅ Peak computation: `lib/upload-client.ts#computePeaksFromBuffer()` uses Web Audio API to decode audio → extract 128 bars → normalize by loudest peak
3. ✅ Feed shape: `lib/beats.ts#ShapedBeat` includes `peaks: number[] | null`
4. ✅ API validation: `app/api/beats/route.ts` validates peaks (array, ≤256 bars, each 0–1), stores as JSON; fixed TS errors with `Prisma.JsonNull`
5. ✅ Waveform component: `components/app/waveform.tsx` — 128 lime-300/white-25 mirrored bars, click+drag seek, 0:00/duration time labels, accessibility (role=slider, aria-valuenow)
6. ✅ Upload form: `components/app/upload.tsx` computes peaks on audio select, sends with metadata to `/api/beats`
7. ✅ Feed integration: `components/app/feed.tsx` — imports `Waveform`, module-level `peaksCache` for old beats, state for `currentTime/duration/fallbackPeaks`, effect for on-demand peak computation if beat lacks stored peaks, `seek()` handler, audio event listeners (`onTimeUpdate/onLoadedMetadata/onDurationChange`), renders `<Waveform>` below beat metadata
8. ⏳ Verification: TypeScript clean (`pnpm exec tsc --noEmit` passes); awaiting manual browser test + `pnpm build`

**Key decisions:**
- **Peak computation:** 128 bars @ normalized 0–1 scale, computed at upload and cached in memory for old beats
- **Fallback:** beats without stored peaks (seeded test beats) fetch presigned audio URL and decode client-side on first view, cached in module-level Map
- **Seek UI:** pointer-capture drag or click-to-seek on the waveform rail, fraction-based (0–1) to audio.duration
- **Styling:** lime-300 for played bars, white/25 for unplayed; 8px min height for visibility

**Outstanding:**
- Browser verification: upload a beat → confirm waveform renders with varying bar heights; view seeded beat → confirm on-demand fallback peaks compute and render
- `pnpm build` to confirm production build succeeds

---

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

### Story 2 — Producer uploads a beat

> As a producer, I want to upload a beat with title, BPM, key, price, tags, and custom artwork so that artists can find and evaluate it.

**Subtasks — all done:**

1. ✅ Upload form layout (title, BPM, key, price)
2. ✅ Artwork upload slot (image/GIF/video) + 6 preset gradient placeholders
3. ✅ Tag input with chip rendering, add-on-Enter/comma, backspace-delete
4. ✅ Tag autocomplete against existing tag list (new tags allowed)
5. ✅ Audio file uploads — presigned PUT direct to MinIO

**Decisions:** MinIO via Docker Compose (dev+prod parity) · official `minio` SDK · presigned PUT (file never passes through Next.js) · feed reads from DB · tags allow free creation.

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

### Beat upload architecture

- **Docker Compose** runs MinIO (`quay.io/minio/minio`) on `:9000` (API) and `:9001` (console). An `mc` init container creates `beat-audio` (private) and `beat-artwork` (public-read).
- **Upload flow:** client `POST /api/uploads/presign` → server validates (auth, role=PRODUCER, mime, size) and returns a presigned PUT URL → client `PUT`s the file straight to MinIO (XHR for progress) → client `POST /api/beats` to save metadata + object keys. **No file bytes ever pass through Next.js**, so there is no body-size limit to configure.
- **Storage layer** `lib/storage.ts` — MinIO client, `presignUpload`, `presignDownload`, `publicUrl`, `deleteObject`. Audio served via short-lived presigned GET; artwork via public bucket URL.
- **Keys** namespaced `audio/{userId}/{uuid}.{ext}` and `artwork/{userId}/{uuid}.{ext}`.
- **Artwork presets:** if no file is uploaded, `artPreset` is stored and `Feed` renders the matching CSS gradient instead of an image.
- **Limits:** audio ≤250MB (mp3/wav/aiff/flac), artwork ≤20MB (png/jpg/gif/webp/mp4/webm).
- **Audio playback:** `Feed` renders a hidden `<audio src={beat.audioUrl} loop>`. Browsers block unmuted autoplay, so it **autoplays muted** and the user unmutes via a Volume button at the top of the action rail (TikTok behaviour). If the object is missing, `onError` disables the button and shows "No audio".
- **Gotcha:** the 4 seeded beats reference `seed/*.mp3` keys that do not exist in MinIO, so they show "No audio". Only beats uploaded through the UI have real audio.

### Schema (current)

```prisma
model Beat {
  id, title, bpm?, musicalKey?, price
  audioKey, artKey?, artUrl?, artPreset?
  durationSec?
  plays, likes, saves, shares, comments  (denormalized counters)
  producerId -> User, tags -> Tag[]
  createdAt, updatedAt
}
model Tag { id, name @unique, slug @unique, useCount }
```

`useCount` powers autocomplete ranking. `lib/beats.ts` `getBeats()` is the single shaping function shared by `app/page.tsx` and `GET /api/beats`.

## Setup Gotchas (important for future sessions)

1. **Next.js 16 renamed `middleware.ts` → `proxy.ts`.** Must export a *function* (default export). Use `export default NextAuth(authConfig).auth`. The old `middleware.ts` will fail the build.
2. **Don't install plain `prisma`/`@prisma/client`** — it resolves to Prisma 8 RC with a completely redesigned CLI (`prisma orm`, `prisma contract`, `prisma db`) and a client/CLI version mismatch. Pin to `prisma@6 @prisma/client@6`.
3. **pnpm blocks build scripts.** `pnpm-workspace.yaml` needs `allowBuilds` entries (`esbuild`, `msgpackr-extract`, `workerd`, `@prisma/client`, `@prisma/engines`, `prisma`). `pnpm approve-builds` is interactive and fails in non-TTY.
4. **`pnpm` is a .ps1 script** — can't be launched via `Start-Process -FilePath pnpm`; use `cmd.exe /c pnpm dev > dev.log 2>&1`.
5. **PostgreSQL wouldn't start** — stale `postmaster.pid` after repeated improper shutdowns, plus very long recovery (>220s) exceeding the Windows service timeout. Fixed by a full uninstall/reinstall of PostgreSQL.
6. **`.gitignore`** — `.env` added (was only `.env*.local`). Also ignores `tsconfig.tsbuildinfo`, `dev.log`, `dev.err.log`.
7. **MinIO is NOT on Docker Hub anymore** — `docker pull minio/minio` fails with "repository does not exist". Use `quay.io/minio/minio` and `quay.io/minio/mc`. (Both images currently use `:latest`; pinning a release tag is optional hardening.)
8. **~~Local Prisma CLI is broken~~ RESOLVED (2026-09-21)** — pnpm's store entry for `prisma@6.19.3` was missing its `build/` folder, so `pnpm exec prisma` failed with MODULE_NOT_FOUND. `pnpm install --force`, remove/re-add, and `pnpm store prune` all failed to fix it (prune keeps *referenced* entries). **The fix that worked:** stop the dev server, delete `C:\Users\Rah\AppData\Local\pnpm\store\v11` AND `node_modules` entirely, then `pnpm install --force` (~13 min). Verified working: `prisma generate`, `prisma migrate status` (3 migrations, in sync). The isolated temp CLI workaround has been deleted.
9. **`prisma generate` hits EPERM** if the dev server is running (query engine DLL is locked). Stop node processes first, generate, then restart.
10. **Slow filesystem gotchas** — PowerShell `Remove-Item -Recurse` is far too slow for huge trees (the pnpm store has ~50K+ files; it timed out at 15 min). Use `cmd /c "rmdir /s /q <path>"` instead. Also expect `pnpm remove`/full installs to take minutes; `pnpm install --force` from an empty store took ~13 min. If store corruption ever recurs after a fix, suspect pnpm 12 (very new major) or antivirus interference — consider pinning pnpm to latest stable v10/v11 or excluding `node_modules` from Defender.

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

Seeded producers (also `password123`): `melok@prod4me.dev`, `niasaint@prod4me.dev`, `junogrey@prod4me.dev`, `treytwo@prod4me.dev` — these own the 4 seeded beats.

Run `pnpm seed` to (re)seed. Note seeded beats reference audio keys (`seed/*.mp3`) that don't exist in MinIO, so they won't play — only artwork/UI works.

*Test accounts were created during testing — delete them when no longer needed.*

---

## Current Runtime State

- PostgreSQL service: **running**
- Docker Desktop: **running**; MinIO container `prod4me-minio` **healthy** on `:9000` / console `:9001`
- Dev server: **running** at http://localhost:3000
- Start stack: `docker compose up -d` then `pnpm dev`

## Story 2 Verification

| Test | Result |
|---|---|
| `docker compose up -d` | MinIO healthy, buckets + public-read + CORS applied |
| Presign audio (producer) | Returns key + presigned PUT URL |
| Presign rejects non-producer / bad mime / oversize | Enforced server-side |
| Browser→MinIO PUT | 200 (audio and artwork) |
| Artwork public GET without auth | 200 (public bucket) |
| Create beat with existing + brand-new tag | Both linked; `useCount` incremented |
| Tag autocomplete `/api/tags?q=` | Returns ranked matches incl. newly created |
| Artwork preset persisted | `artPreset` stored; feed renders gradient |
| Feed reads from DB | Seeded + uploaded beats render |
| `tsc --noEmit` / `pnpm build` | Clean / succeeds |

---

## Not Yet Persisted to DB (known gaps)

These work in-memory but are NOT saved to the database yet:
- Profile edits (bio / theme / banner) — local state only
- Likes, saves, shares, comments — local state only
- Beat uploads, tracks, offers, messages — still mock/UI-only

Relevant DB columns already exist (`bio`, `banner`, `theme`) for profile persistence when needed.

---

## Next Steps

**Waveform story near-complete.** Before next stories:
1. Start Docker Desktop → `docker compose up -d` (MinIO)
2. `pnpm dev` to start Next.js
3. Browser: upload a beat, confirm waveform renders (bars should vary in height matching audio amplitude)
4. Browser: view a seeded beat (e.g., "NIGHTSHIFT"), confirm fallback peak computation runs on first view and waveform renders
5. Terminal: `pnpm build` to confirm production build succeeds
6. Report any issues or confirm ready for next story

When resuming:
1. Read this file
2. Confirm dev server + PostgreSQL + Docker are running
3. Continue on branch `loginndstuff`
