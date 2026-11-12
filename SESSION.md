# PROD4ME — Session Notes

**Date:** 2026-09-16 (updated 2026-10-12)
**Branch:** `ecommerce-section`
**Status:** Sprint 1 (login, upload, waveform, feed) — complete. **Sprint 2 (offers & purchases, Stripe test mode) — code complete.** tsc --noEmit clean, pnpm build clean, all new routes smoke-tested. Stripe keys + CLI webhook testing pending (see Sprint 2 section below).

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
3. Continue on branch `ecommerce-section`

---

# Sprint 2 — Offers & Purchases (2026-10-12, branch `ecommerce-section`)

## Schema (migration `20261012200630_add_offers_payments_licenses`)

- New enums: `LicenseType { NON_EXCLUSIVE, EXCLUSIVE }`, `OfferStatus { PENDING, COUNTERED, DECLINED, AWAITING_PAYMENT, PAID, EXPIRED }`, `PaymentStatus { PENDING, SUCCEEDED, FAILED, REFUNDED }`.
- New models: `Offer` (snapshot `listingPriceCents`, `amountCents`, counter/agreed cents, message/counterMessage, `expiresAt`), `Payment` (`stripeSessionId @unique`, `stripePaymentIntentId?`, `offerId? @unique`), `License` (`@@unique([beatId, artistId, licenseType])`, `pricePaidCents`, `paymentId?/offerId?`).
- `Beat` gains `exclusivePriceCents Int?` and `exclusiveSold Boolean @default(false)`. **`Beat.price` remains integer DOLLARS (Sprint 1 convention) — converted to cents (`price * 100`) only at the Stripe boundary. ALL other money fields are Int cents.**
- Indexes: `Offer(producerId, status)`, `Offer(artistId)`, `Offer(status, expiresAt)`, `License(artistId)`.

## Files

| Area | Files |
|---|---|
| Lib | `lib/money.ts` (pure, client-safe), `lib/offers.ts` (expiry helper `expireStaleOffers()`, shaping), `lib/licenses.ts` (artist library), `lib/stripe.ts`, `lib/finalize.ts` (webhook finalizer, shared) |
| APIs | `POST/GET /api/offers` (create/list, role-aware), `PATCH /api/offers/[id]` (accept/counter/decline/accept-counter), `POST /api/licenses/free`, `GET /api/licenses`, `GET /api/licenses/[id]/download` (auth'd attachment presigned download — artist owning the license only), `POST+GET /api/checkout` (GET = status polling for success page), `POST /api/webhooks/stripe`, `GET /api/cron/expire-offers`, `PATCH /api/beats/[id]` (price + exclusive price), `POST /api/beats` extended with `exclusivePrice` |
| UI | `components/app/purchase-modal.tsx` (license selector, Buy Now confirm → Stripe, Make Offer w/ inline validation, Get Free), `components/app/offers-inbox.tsx` (shared producer/artist offers tab), `components/app/price-editor.tsx`, `components/app/checkout-success.tsx` + `app/checkout/success/page.tsx`, `app/page.tsx` (loads `library` + `openOffers`) — ArtistProfile library cards get a Download button (attachment presign, downloads the original uploaded audio) |

## Rules implemented

- 48h expiry: `expiresAt` reset on every waiting-status change; null on terminal. `expireStaleOffers()` runs at the start of `/api/offers` GET, `/api/checkout` POST, webhook, and cron. Expired offers 409 with "expired" message; UI shows "Expires in Xm/Xh" + Expired badge.
- Stripe Checkout: amount looked up server-side (never client), `expires_at = min(24h, offer expiry)`, prior open session for the offer/beat is expired + payment FAILED before a new "Pay now" session, session metadata `{paymentId, beatId, artistId, licenseType, offerId}`.
- Webhook: signature verified, idempotent (SUCCEEDED payment → no-op), one `$transaction` = Payment SUCCEEDED + License + Offer PAID + exclusive close-out (Beat.exclusiveSold + auto-DECLINE other waiting offers). Late payments still grant license unless exclusive already sold → refund via `stripe.refunds.create`.
- Checkout also re-checks exclusive availability before creating the session (409 "already sold"), and blocks duplicate licenses (`@@unique`).
- Free flow: `$0` non-exclusive → `Get Free` creates License (no Payment); server rejects offers/checkout on it.

## Setup pending (user actions)

1. Paste Stripe **test** keys into `.env.local`: `STRIPE_SECRET_KEY=sk_test_...`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...` (checkout returns 503 with a clear message until keys exist).
2. `stripe login` then `stripe listen --forward-to localhost:3000/api/webhooks/stripe` → paste the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET` (restart dev server).
3. Test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (declined). Success page polls payment status and only renders a message (never writes).

## Interpretations / gaps

- Offers require ≥ $0.50 (no $0 offers; $0 is reserved for the Free flow). Counters also ≥ $0.50 and ≤ listing snapshot.
- There was **no beat edit form** in Sprint 1 — Sprint 2 added price editing via the Dashboard and Producer Profile (`PriceEditor` → `PATCH /api/beats/[id]`), including the exclusive field, disabled after exclusive sale.
- Producer can decline only PENDING offers; artist can decline only their COUNTERED offer. Artist cannot counter (producers move first).
- Seeded data patched: `NIGHTSHIFT` exclusive $499; `LATE CHECKOUT` price 0 (FREE). `pnpm seed` backfills for fresh databases.

---

---

---

# Tasks: recommendation system begins (2026-11-03, branch `social-media`)

#---

---

## Quick fixes round 3 (2026-11-03): library grants & comments are engagement signals

- **New event `COMMENT`** (weight 3 — between TAG_TAP and SAVE, judged strong-but-lighter than SAVE): added to `EventTypeName`/`EVENT_WEIGHTS` (constants), Prisma `EngagementEventType` enum (migration `20261103065000_add_comment_event`, hand-written `ALTER TYPE ... ADD VALUE` since `migrate dev` refuses non-interactive mode), fires client-side in app-shell when a comment is actually posted (dedupe intentionally absent — multiple comments mean multiple signals, like TAG_TAP).
- **Library additions are now server-authorized BUY events:** new `lib/recommendations/record.ts#recordEngagementEvent` (create row + non-blocking vector rebuild). Wired into `POST /api/licenses/free` (after license create; dedupe P2002 path skips) and `lib/finalize.ts` (after the grant transaction commits, when `granted` flag set — the license-exclusive path that would otherwise never be tracked e.g. via webhook while the artist is away). **Client BUY trackers removed** from `purchase-modal.getFree` and `checkout-success` — they'd double-count the same grant now recorded at its single server-side true source.
- Ran migrate deploy + generate + tsc clean (dev server paused PID→15372 for the engine lock; user restarts).

## Quick fixes round 2 (2026-11-03): tag input no longer forces suggestions

- **Bug:** with the suggestion list open, **Enter always adopted the highlighted (≈ previously used) tag** instead of what the user typed — beats kept getting old tags forced on them.
- **Fix (`components/app/tag-input.tsx`):** Enter/comma now commits the **typed draft**. Suggestions only get adopted via an *explicit* choice — click, or arrow-key navigation (`browsingSuggestions` flag, set by ↓/↑, reset whenever the draft text changes, on tag commit, and on suggestion adoption). Escape closes the list. Suggestions stay visible and optional in both the upload tag input and the signup genre input (shared component).
- `tsc --noEmit` clean; both places using `TagInput` (upload + signup genres) get this behavior for free.

## Quick fixes (2026-11-03)

- **Placeholder beats removed.** All 4 seed beats (`NIGHTSHIFT`, `VELVET ROOM`, `LATE CHECKOUT`, `NO SIGNAL` — fictional `seed/*.mp3` keys with no real audio) deleted from prod4me along with their cascaded events; `Tag.useCount` recomputed. `prisma/seed.mjs` no longer creates beats at all (producers + test accounts only) — beats enter via Upload only. Remaining beats are real uploads (`goonrixh`, `covington hwy`).
- **Producer profile from the feed works.** Clicking a producer name previously looked up a hardcoded 4-name mock array (`users` in app-shell) and landed on `UserProfile`, which never showed beats. Now: `app/page.tsx` loads the real producer list (prop `producers` — id/name/avatar/bio), app-shell maps the feed's `onPoster({producerId})` (feed now passes the producer's id) to the real row, and `UserProfile` renders a **Beats · N** grid (art, title, tags, price, plays) — data courtesy of the already-loaded beats; empty state for producers without uploads.

### Task 5 — recommendation seed data + verification suite (2026-11-03, branch `social-media`)

- **`scripts/seed-recommendations.ts`:** 3 viewers (rec-a/b/c@prod4me.dev, password123) — A engages trap/drill, B house/techno, C ambient/lofi (5 LIKEs + SAVE + PLAY_50 + SKIP + FOLLOW_PRODUCER each, mirrored pattern via `engagementSpecFor`), 2 producers, 30 beats across 6 `rec-*` tags (5 per tag; last two slots per group cross-tag with the next group), one sold-exclusive beat baked in (G3K1, exclusion test), `rebuildBeatVector` for all + `rebuildUserVector` per viewer. Cleanup targets **only** `rec-*` accounts (earlier draft included `@prod4me.dev` catch-alls that would've nuked melok/niasaint/… — fixed). `--clean` purges fixtures only. Fixture geometry deliberately leaves ~5 unseen beats per user carrying engaged tags for stable top-5 assertions.
- **`scripts/rec.test.ts`** (6 pass; asserts the DONE-WHEN list): top-5 has ≥3 engaged-tag beats per viewer · page 10 = 8 ranked + 2 explore whose tags avoid engaged groups · exclusions (own/seen-7d/sold) hold across all pages · follow bonus strictly orders + caps at 1.0 · cold-start flips at the 5-event threshold (4→cold true, 5→full scoring) · tag feed is tag-pure, no explore slots, unknown tag → FeedTagNotFoundError. zx-cold user created per run and self-cleaned.
- **README "Recommendation Algorithm" section** added (signals/weights table, decay formula, score formula exactly as implemented, feed composition + exclusions, cold start, cursor, tag mode, tuning via constants.ts, test/seeding entry points).
- **Review-pass fixes across earlier tasks:** 🐞 explore-gate slot bound used `CANDIDATE_LIMIT` (200) instead of `VECTOR_DIM` (256) — tags with vectorIndex ≥ 200 escaped the zero-affinity gate; 🐞 `/api/feed` could theoretically be statically cached (GET without dynamic marker) → `export const dynamic = 'force-dynamic'`; 🐞 seed-recommendations stored UN-hashed passwords (bcrypt compare in login would've failed) → hashed via bcryptjs; 🐞 `--clean` flag didn't halt reseeding → now cleanup-only; 🐞 rec.test asserted producers "warm" (producers are legitimately cold) → filter restricted to the 3 viewers; dead code in rec.test removed.
- **Full battery final state: rec 6/6 · feed 4/4 · scoring 6/6 · `tsc` clean.** Seed script also idempotent (re-runs wipe + rebuild their own fixtures only).

## Feed "blank" hardening (2026-11-03) — UI never blank

- **Root cause of a blank personalized feed:** rules working as designed on a tiny database — the user engaged (SKIP most recently) with ALL beats in the DB within 7 days, so seen-exclusion emptied candidates AND the zero-affinity explore gate couldn't backfill (those tags were inside the taste vector).
- **Fix — 3 server tiers in `lib/recommendations/feed.ts#getFeedPage`:**
  1) strict personalized/explore (spec rules),
  2) relaxed fallback: drop the 7-day-seen rule and the affinity gate (own-beat & sold exclusions kept), ranked populist × recency (up to FEED_PAGE_SIZE),
  3) last-resort: allow own beats too (sold still excluded) — any beat on the platform ⇒ a page.
- **UI guarantee (app-shell):** after every feed fetch, `ensureFeedNeverBlank()` hydrates `feedBeats` from the server-rendered `beats` prop if it's still empty (API 500/failure/empty) — playback-ready unpersonalized beats, so playback can never break.
- Earlier mislead: the first curl check hit a dev server that wasn't actually running (0 node processes — user's dev was down), so "restart didn't help" couldn't be reproduced until this hardening landed. Tests: feed 4/4 pass + tsc clean.

## Task 4 errata (2026-11-03): explore-slot IN clause rendered as a row-record

- Bug reported live (`integer = record` from `GET /api/feed`): the explore beat gate rendered `IN ((0,7,8,...))` — `Prisma.raw('(0,7,...)')` wrapped the CSV in a second parentheses, so Postgres parsed a ROW/record literal instead of a value list. Fix: emit the bare CSV (`Prisma.raw(slotCsv)` → `IN (0,7,8,...)`); values are validated integers before inlining. Other `IN` sites were unaffected (id lists use `Prisma.join` with per-element params, creating one pair of parens at the template level).

## Task 4 — personalized feed endpoint + UI wiring (2026-11-03, branch `social-media`)

**`lib/recommendations/feed.ts` — `getFeedPage(userId, {cursor, tag})`:**
- **Personalized:** FEED_RANKED_SLOTS (8) via `rankCandidates` (now takes `excludeBeatIds` for session dedupe) + random FEED_EXPLORE_SLOTS (2) explore beats whose tags carry **zero affinity** (non-zero tasteVector slots computed via `::text`, gates the SQL via validated inline slot list `t."vectorIndex" IN (...)`) up to FEED_PAGE_SIZE (10). Explore top-up fills the page when the ranked pool is small.
- **Cold start:** fewer than COLD_START_MIN_EVENTS (5) events → ranked slots by **popularity × recency** (both unit-normalized, product; popularity = per-beat window event count ÷ max).  Auto-switches to full scoring at threshold.
- **Tag mode:** `?tag=name` — tag-unknown throws `FeedTagNotFoundError` (route → 404). Tag-scoped rows passed through the same exclusions, scored with FULL scoring (per-beat similarity via reflection JOIN + buildContext/scoreBeat) or popularity×recency when cold. NO explore slots.
- **Cursor:** base64url `{s: [delivered ids]}` — resilient to reshuffles; every pool (ranked, explore, tag) filters `notIn seen`; client additionally dedupes on append. nextCursor null when a page can't fill FEED_PAGE_SIZE.
- **Exclusions identical everywhere:** own beats / seen-last-7d-engaged / sold exclusives (shared `exclusionsWhere`).
- Returns full **ShapedBeat** payloads (audio presign + artwork + counters) via extracted `lib/beats.ts#shapeBeat` — playback behavior preserved by construction. lib/beats imports de-aliased to relative `.ts` so node test scripts can import it.

**`app/api/feed/route.ts`:** GET, 401 unauth, 404 on unknown tag, 500 catch, returns `{beats, nextCursor, coldStart}`.

**UI (`components/app/app-shell.tsx`):** feed data source replaced — new state `feedBeats/feedCursor/feedTag/feedLoading`; mount + tag-change effects fetch `/api/feed`; wheel-next prefetches the next page before hitting the end; tag-pill tap (`handleFeedTagTap`) switches to tag mode (toggle-off supported), chip dismiss (`clearFeedTag`) returns to the personalized feed; server-rendered `beats` prop remains for dashboard/profile/library (NOT the feed). Loading state added to the empty branch; all Feed styling/playback untouched (same ShapedBeat shape).

**Tests:** `scripts/feed.test.ts` (node:test, disposable fixtures) 4/4 pass: (1) ≥COLD events users w/ different histories (trap vs jazz) get different feeds; (2) 0-event user gets populated feed + coldStart=true; (3) cursor walk pages → zero duplicates & all fixture beats delivered exactly once; (4) tag feed only returns matching beats + unknown tag → FeedTagNotFoundError. scoring.test.ts still 6/6. `tsc` clean.

**Flags/interpretations:** (1) explore tag gate = "all of the beat's tag slots must be zero-weight in the user's tasteVector" — a NULL-vectorIndex tag counts as zero-affinity (not vector-covered); (2) explore count = 2 within spec, but tops up to fill a page whose ranked side can't (small DB) — revisit if undesired; (3) event threshold counts ALL-TIME events (window ambiguity noted for TASK parity); (4) tag-mode scoring re-uses per-beat cosine (beats outside top-200 candidates are included, unlike ranked mode); (5) cold-start threshold counts events regardless of role (producers personalize too); (6) 401/404 paths verified by inspection only — server not started by me (per your rule), awaiting your UI runthrough.

# Task 3 — candidate retrieval + scoring (2026-11-03, branch `social-media`)

**`lib/recommendations/scoring.ts`** — `getCandidates(userId)`: single `$queryRaw` (pgvector `<=>` cosine) returning top `CANDIDATE_LIMIT` (200) beats by `1 - (tagVector <=> tasteVector)` with SQL-side exclusions (own beats via `producerId <> userId` / any event on a beat within `SEEN_EXCLUSION_DAYS` via NOT IN subquery / `exclusiveSold`). Null/no tasteVector → `[]` (cold-start). `scoreBeat(userId, beat, similarity, context)`: weighted blend (`similarity 0.6 × clamp01`, `producer 0.2` (raw decayed sum per producer ÷ max in candidate set), `recency 0.1` (linear 1→0 over `RECENCY_ZERO_DAYS`), `popularity 0.1` (event count in event-window ÷ max in set)), `FOLLOW_BONUS` (+0.15 only for followed producers), capped at 1.0. `buildContext(userId, candidates, followedProducerIds?)` computes the per-candidate aggregates (window = EVENT_WINDOW_DAYS). `rankCandidates(userId, {followedProducerIds?})` → `RankedBeat[]` sorted score desc (ties: similarity desc → candidate input order). Follow persistence doesn't exist yet (in-memory mock in app-shell), so follows enters as a scored-context parameter — task flagged; a `Follow` model + API is a future task.

**Tests:** `scripts/scoring.test.ts` (node:test runner, real DB, disposable fixtures w/ ids `zx*` emails / `zxcheck-*` slug tags, self-cleaning + `cleanupPreviousRun()` for crashed runs). Run: `node --env-file=.env --test scripts/scoring.test.ts`. 6/6 pass: (a) trap-taste user ranks pure-trap beat first (cosine 1.0), no-overlap beats never filtered; (b) SKIP lowers the beat's cosine through the taste vector + excluding it near-term via seen-rule (SKIP remains a similarity signal for OTHER beats' affinities); (c) 100-day event → null taste → no effect at all; (d) follow bonus strictly ordering + hard cap 1.0; (e) own/seen/sold exclusions respected in SQL; (f) null taste → `[]`.

**Test-runner notes (dev-env learnings):** PRISMA `log: ['query']` spam floods test output — consider scoping to error in dev later; `tsconfig.target` ES6 → bumped **ES2022** (top-level await in ts scripts for node:test; SWC owns real emit so Next unaffected); `tsbuildinfo` incremental cache can serve stale errors after config change. `$queryRaw` gotcha repeated: float8 numbers deserialize fine, vector columns must `::text`.

**Interpretations/flags:** (1) `similarity = 1 - cosine_distance` ∈ [-1,1] then clamp01 in scoring (negative similarity possible → cannot boost); (2) popularity uses events *within the event window* ("total event count" was ambiguous — window version stays fresh & keeps the per-beat counts cheap); (3) producerAffinity includes events on ANY of that producer's beats (not just candidate rows) since taste lives at the producer level; (4) rankCandidates is pure server-side: no beat fetch of artwork (presigned/public URLs happen at the feed-mapping layer, next task); (5) no API route yet — ranking is a library call for the feed task; (6) SQL exclusions rely on non-null `tagVector` (upgraded beats only) — unvectored beats surface later through explore slots, not ranking.

# Task 2 — pgvector tag/taste vectors (2026-11-03, branch `social-media`)

**pgvector install:** the `vector` extension was NOT bundled with the EDB PG18 install. Installed pgvector **0.8.6** (Windows build) from `andreiramani/pgvector_pgsql_windows` release assets (community repo, 232★, most-active maintained build; drop-in: `lib\vector.dll` into `...\PostgreSQL\18\lib`, extension SQLs into `...\share\extension`, headers into `...\include\server`). Postgres stopped (pg_ctl) during copy per readme, restarted, then `CREATE EXTENSION vector` on `prod4me`. ⚠️ third-party binary — acceptable for dev; revisit trust/upgrade path before prod. Official alternative exists: `pgvector/pgvector` Docker image (not used — native-PG chosen earlier).

**Migration `20261103053000_add_pgvector_tag_vectors`:** `CREATE EXTENSION IF NOT EXISTS vector` FIRST, then Prisma-diff DDL (`Beat.tagVector vector(256)`, `User.tasteVector vector(256)`, `Tag.vectorIndex int unique`), backfill of vectorIndex (ROW_NUMBER-1 over tag id order; tags beyond slot 255 stay NULL), BEFORE-INSERT trigger `assign_tag_vector_index` (next = max+1, NULL when ≥256 — covers ALL creation paths incl. seed/connectOrCreate), HNSW index `Beat_tagVector_hnsw_idx` using vector_cosine_ops. Crafted non-interactively via `prisma migrate diff --from-migrations --shadow-database-url` (transient shadow db `prisma_shadow_pgvector`, dropped after). NOTE the live-migration-bug: first apply put `tasteVector` on the wrong table (pilot error, caught by runtime test); fixed schema+SQL+live DB (dropBeat/addUser) in place.

**`lib/recommendations/vectors.ts`** (all vector I/O raw SQL `$executeRaw` casts `::vector`, string literal `[..]` bracket format; `vectorToString`, `buildMultiHot` L2, `rebuildBeatVector(beatId)` L2-normalized multi-hot (null slots skipped; zero→stored NULL), `rebuildUserVector(userId)`: sum over events in EVENT_WINDOW_DAYS of EVENT_WEIGHTS×0.5^(age/DHALFLIFE) on the beat's UNNORMALIZED multi-hot (SKIP subtracts via negative weight), L2-normalize (zero→NULL store)). Constants imported ONLY from `./constants.ts` (VECTOR_DIM, weights, decay).

**Node/Next import voyage:** this task uses explicit `.ts` extension imports inside `lib/recommendations/**` + `scripts/**` because raw Node (`node scripts/*.ts`) cannot resolve alias/extensionless TS imports; Next/SWC handles them fine. tsconfig gained `allowImportingTsExtensions` (noEmit already true). App routes import vectors.ts with the same relative `.ts` path for consistency (e.g. `@/lib/recommendations/vectors.ts`).

**Wiring:** `POST /api/events` → after create, non-blocking `void rebuildUserVector(userId).catch(warn)` (dedupe-return path skips rebuild). `POST /api/beats` → after create, non-blocking `void rebuildBeatVector(beat.id).catch(warn)`. No tag-edit path exists today, so "tags changed" = creation only; revisit if a tag-edit UI lands (post-offers invariants unchanged). `prisma seed` needs no change (trigger assigns slots; beat vectors still seeded by the backfill script below).

**Scripts:** `scripts/backfill-beat-vectors.ts` (runs rebuildBeatVector for all beats; idempotent) — rerun after bulk tag changes. `scripts/verify-vectors.ts` (throwaway sanity: beat norms + one-taste cosine check) — safe to delete.

**Verified (DONE-WHEN):** every beat's tagVector dims=256 norm≈1.0 with 1/√n at exact tag slots (6/6 beats, incl. user-uploaded `goonrixh`/`covington hwy`); fresh user + single LIKE on a beat → tasteVector unit-norm cosine distance 0 vs that beat (points exactly at its tag slots); source rankings unchanged. `tsc --noEmit` clean. Manual-test tag additions (`plugg`, `neosoul`, `brentfaiyaz`, …) got trigger-assigned slots 7–13 automatically. `engine pg18` → on fresh installs, `CREATE EXTENSION` must run BEFORE migrate (see migration header).

**Interpretations/flags:** (1) sorted backfill uses `id` order not createdAt (Tag has no createdAt; deterministic regardless); (2) taste uses *unnormalized* multi-hot per spec — repeated exposure accumulates (deliberate vs. averaging engagement); (3) future-dated events (clock skew) treated as age 0; (4) `$queryRaw` can't return vector columns — cast `::text` on any vector read (verified error otherwise); (5) dev-server restart required for the regenerated client (I stopped PID for generate per EPERM gotcha; user restarts pnpm dev themselves).

---

## Task 1 — Engagement event capture

**Infrastructure:** `lib/recommendations/` is the home of ALL recommendation logic; every tunable lives in `lib/recommendations/constants.ts` (EVENT_WEIGHTS, DECAY_HALF_LIFE_DAYS=30, EVENT_WINDOW_DAYS=90, VECTOR_DIM=256, SCORE_WEIGHTS {similarity .60/producer .20/recency .10/popularity .10}, FOLLOW_BONUS, FEED_PAGE_SIZE/RANKED/EXPLORE (10/8/2), COLD_START_MIN_EVENTS, SEEN_EXCLUSION_DAYS, RECENCY_ZERO_DAYS, CANDIDATE_LIMIT, SKIP_UNDER_MILLIS=3000). Prisma CANNOT query vector columns → all future pgvector reads/writes via `$queryRaw`/`$executeRaw`. No user-visible UI changes; feed keeps current shape. Test-runner note: repo has no test framework — "run the tests" = tsc + raw SQL/API-level verification unless a task adds otherwise.

**Schema (migration `20261103040518_add_engagement_events`):** enum `EngagementEventType { PLAY_50, PLAY_COMPLETE, TAG_TAP, LIKE, SAVE, FOLLOW_PRODUCER, OFFER, BUY, SKIP }`; model `EngagementEvent {userId, beatId, type, createdAt}` with `@@index([userId, createdAt])` + `@@index([beatId])`; cascade relations on User + Beat. NOTE: enum values must stay in sync with `EVENT_WEIGHTS` keys in constants.ts (validated at runtime in the route; a mismatch fails 400s, not silently).

**API:** `POST /api/events` `{beatId, type}` — auth'd userId only; 401 unauthenticated; 400 invalid JSON/type/beatId; LIKE & SAVE are idempotent per (user, beat, type) via findFirst-before-create → repeat returns 200 `{ok,duplicate:true}` and writes no row (server-side truth; a client un-like + re-like does NOT log a second LIKE).

**Client tracking (`lib/recommendations/track.ts`):** `trackEvent(beatId, type)` — fire-and-forget `fetch` with `keepalive:true`, failures swallowed, never awaited. Wired: feed.tsx (PLAY_50 ≥50% heard, PLAY_COMPLETE ≥ duration−1s once per view — audio is `loop` so `ended` never fires; TAG_TAP on pill taps via TagPills onTag wrapper), app-shell.tsx (LIKE/SAVE only on the *positive* action; SKIP when the visible beat changes or feed tab left and the outgoing beat was seen < 3s — at most one SKIP per beat view; not fired while a profile overlay is up), purchase-modal.tsx (OFFER on successful offer creation; BUY on free-license grant), checkout-success.tsx (BUY when payment SUCCEEDED — `/api/checkout` GET now also returns `beatId`).

**Interpretations/flags:** BUY fires on server-confirmed completion (success page), not on checkout-button click; free-license grant counted as BUY (both are conversions through the same modal). AUDIO seek to 50% counts as PLAY_50 (no continuous-listening check — noted as acceptable for now). Event write failures are silent client-side by design (telemetry must never interrupt UX); a server outage is invisible to users, by rule.

**Verified (real API + DB):** 11 curl cases — 401 unauth; 400 invalid type / unknown beat; PLAY_50/ SKIP/ TAG_TAP create rows; LIKE + SAVE dedupe (2 calls → 1 row each, 2nd returns `{ok,duplicate:true}`); DB row counts confirmed via psql. `tsc --noEmit` clean. Seed change: `artist@test.com` (password123) now created idempotently WITH interests drill + dark-trap + `interestCount` bump (was missing after machine reset — re-ran `pnpm seed` to pick it up).

# Signup genre interests + interest-ranked feed (2026-11-03, branch `social-media`)

**Feature:** Artists pick up to 6 free-form genres at signup (step 3 of the wizard, skippable; producers unaffected). Interests persist as `Tag` links on `User`, and `getBeats()` reorders (never filters) the artist's Discover feed by tag-overlap with their interests — beats sharing more picked genres float to the top, ties/newest otherwise. Producer feed and `/api/beats` stay chronological.

**Why reuse `Tag`:** seeded beat tags (`drill`, `r&b`…) ARE genres, so a new artist's picks overlap existing beats immediately. Added `TagType` enum (`GENRE` default, `STYLE` reserved) + `Tag.interestCount` (users who picked it; `useCount` still counts beats) + implicit m2m `User.interests`/`Tag.interestedUsers` ("UserInterests"). Migration `20261103030237_add_tag_types_user_interests`.

**Files:** `lib/tags.ts` (normalizeGenres cap 6, slug dedupe, getOrCreateGenreTags upsert-tx, incrementGenreInterestCounts) · `app/api/auth/register/route.ts` (optional `genres: string[]`, saved user+links atomically) · `app/api/tags/route.ts` (`?type=genre`; unauthenticated allowed ONLY with that param so signup can show popular chips — ranked by interestCount when no `q`) · `components/app/tag-input.tsx` (new `suggestType="genre"` prop) · `app/(auth)/signup/page.tsx` (3-step wizard for artists: details → role → genres w/ popular chips + skip; producers still 2-step, create directly) · `lib/beats.ts#getBeats(take, interestNames)` + `app/page.tsx` (loads `user.interests`, passes names for ARTIST) · `prisma/seed.mjs` (creates `artist@test.com` idempotently, password123, interests = drill + dark trap, and bumps those `interestCount`s).

**Deliberately deferred:** editing interests post-signup (lands with the profile-persistence story), style/vibe taxonomies (`STYLE` enum value staged), "Because you follow X" feed badges, genre browse pages.

**Test notes:** m6 artist account + interests → picks N. New artist signup w/ genres, skip path, duplicate coin ("Drill" by 2 users = 1 row), ordering flip on/off interests, upload autocomplete regression (`/api/tags?q=` unchanged shape). ⚠️ `pnpm dev` was running during implementation → `prisma generate` EPERM'd (known pitfall #9); regenerate after stopping dev, then restart.

---

## Download feature (2026-10-14)

- `GET /api/licenses/[id]/download` — artist-only (auth'd, license ownership enforced server-side), `objectExists` check, 5-min attachment presigned URL (`presignAttachmentDownload` in `lib/storage.ts`), filename = beat title. Download button on ArtistProfile library cards.
- AppShell library state now re-syncs on refreshed server props (`useEffect([library])`) so fresh licenses are downloadable without a reload.

## Forgot password (2026-10-14)

- Migration `20261014000910_add_password_reset_fields`: `User.resetTokenHash`, `User.resetTokenExpiresAt`.
- `lib/reset-token.ts`: SHA-256 hashed tokens (raw token = 64 hex chars, 1h TTL, single-use, cleared after use).
- `POST /api/auth/forgot-password` (generic 200 — no account enumeration, in-memory rate limit 5/15min, logs link to console + returns `devLink` in dev since no SMTP is wired), `POST /api/auth/reset-password` (bcrypt 10, parity with register).
- Pages: `(auth)/forgot/page.tsx` (shows the devLink box in dev), `(auth)/reset/page.tsx` + `reset-form.tsx` (confirm field, inline errors), "Forgot password?" link on the login page. `lib/auth.config.ts` whitelist extended to `/forgot` + `/reset`.
- **Restart pitfall:** new route files 404'd until the dev server restarted (Turbopack dev did not hot-register `/api/auth/forgot-password`; even `/api/auth/session` 404'd until restart). Adding routes while dev is running = restart dev.
- Password recovery performed: `rmclaurin@ggc.edu` reset to `password123` through the running app (E2E verified: devLink → reset ok → token replay rejected 400 → bcrypt compare true).

## Webhook reliability work (2026-10-14)

- **Root cause of the "$9 not confirmed" payment:** a zombie `stripe listen` from a dead console (PID 7808) was the only subscriber and stopped forwarding; a second redirected listener had died silently. Slow-filesystem warnings are unrelated (server answered webhooks 200 all along).
- **Self-healing poll:** `GET /api/checkout?session_id=` now, when the payment is still PENDING, does `stripe.checkout.sessions.retrieve()` and if Stripe says `paid` runs `finalizeCheckoutSession()` directly — success page grants the license even if the listener is dead (`selfHealed: true` in the response). Reuses the webhook's exact finalize path.
- **Listener ownership:** Claude keeps `stripe listen` running as a background task on THIS machine, redirected to `listener.log` / `listener.err.log` (`L:\` note: started via `Start-Process cmd '/c stripe listen --events checkout.session.completed,checkout.session.expired --forward-to localhost:3000/api/webhooks/stripe ^> listener.log 2^> listener.err.log'`). On OTHER machines the user runs it themselves. Watch with `Get-Content listener.log -Tail 20 -Wait`. If it dies, restart it, then re-deliver missed events with `stripe events resend <evt_id>` (find ids via `stripe events list`).
- Note: this Stripe CLI/sandbox prints the SAME `whsec_...` (whsec_e1cb…) on every `stripe listen` restart — per-account fixed secret, so .env.local needs no update between listener restarts.
