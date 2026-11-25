# PROD4ME — Session Notes: Dev Tooling & Feed Sound

**Dates:** 2026-11-04 → 2026-11-06 (updated 2026-11-15)
**Status:** Complete. `tsc --noEmit` clean. All features verified live against local Postgres + MinIO.
**Scope:** Dev-mode dataset seeder (CLI + in-app panel), drag-and-drop mass audio dump with a shared audio pool, auth redirect-loop fix, feed autoplay sound-on, Stripe test card reference.

---

## The big picture

This session added a complete **test-data toolchain** so the recommendation algorithm can be exercised at scale with real audio: drop your own sound library into the app, seed hundreds of beats across dummy producers, simulate realistic listening histories per dummy artist, and watch the personalized feed converge. Plus two product fixes found along the way (auth redirect loop, feed autoplay muted-by-default).

---

## 1. Dev dataset seeder — shared engine

**New: `lib/dev-seed.ts`**

The single engine behind both the CLI script and the /dev panel. Everything is namespaced under `dev-*@prod4me.dev` emails so cleanup can never touch real accounts (FK cascade removes their beats, events, offers, payments, licenses; shared genre tags survive).

Features:

- **Deterministic randomness** — `mulberry32` seeded PRNG; `--seed 42` reproduces the exact same dataset (accounts, beats, engagement) across runs.
- **Genre profiles** — plausible BPM ranges and musical keys per genre (trap 130–150, house 120–128, lofi 70–90, dnb 168–176, etc.), with a sane fallback for unknown genres.
- **Synthetic WAV generation** — valid, playable 16-bit PCM mono WAVs (kick pulses + bass drone + hat noise, ~12s, 11kHz) built in pure Node, zero dependencies, so seeding works with no audio assets at all.
- **Beat metadata** — random title wordlists, genre-appropriate BPM/key, price (15% free, else $5–$49, 20% also get an exclusive price), random-walk 128-bar waveform peaks, duration from file header (WAV exact; lossy estimated at ~128kbps).
- **Simulated engagement** — each artist gets 1–3 genre interests, then a listening history biased ~75% toward beats matching those interests / ~25% random. Event mix mirrors real usage weights: PLAY_50 (30%), PLAY_COMPLETE (20%), LIKE (14%), SAVE (10%), TAG_TAP (10%), COMMENT (4%), SKIP (12%, negative signal). 1–2 producer follows on engaged beats. Events spread over the last 14 days so time-decay is realistic. `rebuildUserVector` runs per artist — taste vectors form real, testable clusters.
- **Vectors** — all beat/user vectors rebuilt through the production pipeline (`lib/recommendations/vectors.ts`), never drift from what the app does.
- **Audio pool** (added later, see §3) — `audio/dev-pool/` prefix in the `beat-audio` bucket; `addToAudioPool` / `listAudioPool` / `clearAudioPool` / seeded shuffle.
- **Guards** — `devPanelEnabled()`: panel + routes exist only when `NODE_ENV !== 'production'` or explicit `DEV_PANEL=1`.
- **Stats** — dev user/beat/event counts + pool file count/bytes for the panel overview.

**Audio source priority:** dev pool → `--dir` folder (CLI) → synthetic WAVs.

## 2. CLI script

**New: `scripts/seed-dev-dump.ts`** (thin wrapper around the engine)

```
node --env-file=.env scripts/seed-dev-dump.ts                                    # 200 beats, 8 producers, 10 artists, 40 events/user
node --env-file=.env scripts/seed-dev-dump.ts --beats 500 --artists 20 --seed 42
node --env-file=.env scripts/seed-dev-dump.ts --dir ./my-audio                   # real files
node --env-file=.env scripts/seed-dev-dump.ts --clean                            # purge dev-* only
```

**package.json**: added `seed:dump` and `seed:dump:clean` scripts.

## 3. Dev panel UI (the button-driven version)

**New: `app/dev/page.tsx`** — server component; `notFound()` in production, redirects to `/login` when logged out, `dynamic = 'force-dynamic'`.

**New: `components/dev/dev-panel.tsx`** — standalone dark/lime page with:

- **Stats strip** — live dev users / beats / events counts (GET `/api/dev/seed`).
- **Dataset Seeder** — number inputs (beats, producers, artists, events/user, seed), genre pool text field, **Run Seeder** and **Purge dev data** (confirm-guarded) buttons. Results panel shows elapsed time, audio mode, per-account email list with roles + interests so you can log straight into a test user.
- **Audio source line** — shows "your pool — N files (X MB) drawn randomly per beat" when the pool has content, or the synthetic-WAVs hint when empty, with a **Clear pool** button.
- **Mass Audio Dump** — native HTML5 drag-and-drop zone (multi-file, click-to-browse fallback), per-file progress bars via XHR (not fetch, so real upload %), and **two actions**: **Add to pool** (stage files for the seeder) or **Dump as beats** (each file = one instantly playable beat). Per-file status icons, error messages, done summary ("N uploaded").
- **"← Back to app"** button in the header linking to `/`.

**New routes (all guarded by `devPanelEnabled()` + auth):**

- `app/api/dev/seed/route.ts` — GET stats, POST run seeder (clamped params: beats 1–2000, producers 1–50, artists 1–100, events 0–500), DELETE purge.
- `app/api/dev/dump/route.ts` — one audio file per request (client loops → real per-file progress, no giant multipart bodies). `mode=beat` (default) creates a beat; `mode=pool` stages into the pool. 250MB cap via `MAX_AUDIO_BYTES`.
- `app/api/dev/pool/route.ts` — GET pool contents, DELETE clear pool.

**Discoverability:** `components/app/sidebar.tsx` gained a **"Dev panel" link** (flask icon, bottom of nav) rendered only when the home page passes `devPanel={devPanelEnabled()}` — compiled out of production builds automatically.

## 4. The audio pool tie-in (your own library across dummy accounts)

The two features now share one pipeline: drop files → **Add to pool** → **Run Seeder** pulls **random pool files per beat** (seeded shuffle, cycled when beats > files), assigns them to random dummy producers, wraps them in random genre tags/metadata, and simulates listening.

**Performance fix (important):** the first implementation downloaded every pool file into the app server's memory and re-uploaded the bytes per beat — with a 41-file / 160MB pool that meant hundreds of MB through the dev server (hangs/OOM risk). Replaced with **MinIO server-side copies** (`copyObject` in `lib/storage.ts`): pool files are copy *sources*, zero bytes flow through Node, no memory cap, any pool size. Duration for pool-sourced beats is estimated from file size (~128kbps assumption).

## 5. Bug fix: auth redirect loop

**Modified: `lib/auth.config.ts`** — the `authorized` callback previously redirected logged-in users away from `/login` back to `/`. If the session cookie referenced a deleted user (e.g. after **Purge dev data** while logged in as a `dev-*` account), this looped forever: `/` → no user row → `/login` → cookie present → `/` → … The auth-route bounce was removed; the login form always renders, and a fresh sign-in overwrites the stale cookie.

## 6. Bug fix: feed autoplay sound-on

**Modified: `components/app/feed.tsx`** — beat autoplay previously forced `muted = true` (TikTok-style). Now it **tries unmuted playback first**; if the browser's autoplay policy rejects it (possible on a cold load with zero interaction), it falls back to muted autoplay and the volume button works as before. After any user interaction (e.g. logging in), sound is on by default for the whole session. Verified live: audio element reported `muted: false, paused: false` with playback progressing.

## 7. Storage helpers

**Modified: `lib/storage.ts`** — added `putObject` (server-side direct upload), `copyObject` (in-bucket server-side copy), `listObjectEntries` (prefix listing) for the dev tooling. Existing presign/URL behavior untouched.

---

## Files changed (summary)

| File | Change |
|---|---|
| `lib/dev-seed.ts` | **New** — seeder engine (accounts, pool, beats, engagement, vectors, purge, stats) |
| `scripts/seed-dev-dump.ts` | **New** — CLI wrapper |
| `app/dev/page.tsx` | **New** — dev panel page (prod-disabled) |
| `components/dev/dev-panel.tsx` | **New** — panel UI (seeder + drag-drop dump + pool) |
| `app/api/dev/seed/route.ts` | **New** — run/purge/stats |
| `app/api/dev/dump/route.ts` | **New** — single-file dump (beat or pool mode) |
| `app/api/dev/pool/route.ts` | **New** — pool list/clear |
| `lib/storage.ts` | Added `putObject`, `copyObject`, `listObjectEntries` |
| `lib/auth.config.ts` | Fixed `/login` redirect loop |
| `components/app/feed.tsx` | Unmuted-first autoplay with muted fallback |
| `components/app/sidebar.tsx` | Dev-only "Dev panel" link (new `devPanel` prop) |
| `components/app/app-shell.tsx` | Threads `devPanel` prop to Sidebar |
| `app/page.tsx` | Passes `devPanel={devPanelEnabled()}` |
| `package.json` | `seed:dump`, `seed:dump:clean` scripts |

No schema changes. No changes to production behavior outside the two bug fixes (§5, §6).

---

## Verification performed (live, local stack)

1. CLI smoke seed: 6 beats / 2 producers / 2 artists / 23 events in **1.2s** (`--seed 42`).
2. Panel "Run Seeder": 12 beats in **0.8s** from the UI.
3. Drag-and-drop dump: 3 WAVs → 3 playable beats, correct durations, tags applied.
4. Pool flow: 3 staged WAVs → 6-beat seed → **all 6 audio objects byte-matched pool files** (randomly cycled); pool intact afterward.
5. Scale: **200 beats seeded from the 41-file / 160MB pool** (server-side copies) — fast, no memory pressure.
6. Vectors: beat vectors norm 1.0, cosine distance 0 (`scripts/verify-vectors.ts`); dev artists have non-null taste vectors; feed API returns `coldStart: false` with ranked results.
7. Audio streaming: presigned GET → `200, audio/wav` from MinIO.
8. Auth loop fix: stale-cookie tab reaches the login form and re-signs-in cleanly.
9. Autoplay: fresh tab → feed plays unmuted automatically.

---

## How to use

1. Start the stack: Postgres (`pg_ctl.exe -D C:\pgdata\prod4me start`), Docker/MinIO, `pnpm dev`.
2. Log in with any account → **Dev panel** in the sidebar (or `/dev`).
3. Drop audio files → **Add to pool**.
4. Configure beats/genres/seed → **Run Seeder**.
5. Log in as `dev-artist-N@prod4me.dev` / `password123` → the Discover feed is personalized; explore slots surface genres the artist hasn't touched.
6. **Purge dev data** (panel) or `pnpm seed:dump:clean` resets everything; real accounts and shared genre tags are untouched.

**Stripe test card** (test mode only): `4242 4242 4242 4242`, any future expiry, any CVC — exercises the full offer → checkout → webhook → license path. Decline test: `4000 0000 0000 0002`.

---

## Notes & known limitations

- Pool-sourced beat durations are estimated (~128kbps) — exact for WAV CLI/synthetic paths, approximate for mp3s.
- The panel's seeder always uses the pool (or synthetic fallback); the `--dir` option is CLI-only.
- The "type: module" Node warning when running scripts is pre-existing (matches other scripts in the repo).
- Postgres must be started manually after reboots (unchanged from before; service registration is still a future option).
