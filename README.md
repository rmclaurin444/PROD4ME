# PROD4ME

A TikTok-style vertical feed for discovering and selling beats. Producers upload tracks with artwork, BPM, key, and price; artists scroll a full-screen feed, preview waveforms, save beats, and negotiate offers.

> Originally generated as a clickable prototype in [v0.app](https://v0.app) (single hardcoded `app/page.tsx`, no backend). Since then it's been rebuilt into a real full-stack app: authentication, a Postgres-backed data model, direct-to-object-storage file uploads, and a real audio waveform.

## Features

- **Two fixed roles at signup** — Producer or Artist, chosen once and enforced everywhere (nav, feed actions, upload access)
- **Vertical beat feed** — full-bleed artwork, autoplay-muted audio, like/save/share/comment counters, tag filtering, wheel-to-advance
- **SoundCloud-style waveform** — real per-track amplitude bars computed client-side from the audio file, click/drag to seek, with an on-demand fallback for beats that predate stored waveform data
- **Beat upload pipeline** — drag-and-drop audio + artwork (or pick from gradient presets), tag autocomplete, direct browser → object storage upload (audio/artwork bytes never pass through the Next.js server)
- **Artist genre interests** — up to 6 free-form genres picked at signup; the Discover feed reorders (never filters) to surface beats whose tags match the artist's genres
- **Producer/Artist profiles** — editable bio, banner, theme; artists can link finished tracks back to a beat they licensed
- **Offer/negotiation UI, inbox, comments** — in progress; see [Known Gaps](#known-gaps-not-yet-persisted)

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack) — **note:** this version renames `middleware.ts` → `proxy.ts`; see [AGENTS.md](./AGENTS.md) |
| Language | TypeScript 5.7 (strict) |
| UI | React 19, Tailwind CSS 4, [shadcn/ui](https://ui.shadcn.com) |
| Icons | lucide-react |
| Database | PostgreSQL via [Prisma ORM](https://www.prisma.io) 6 |
| Auth | [Auth.js v5](https://authjs.dev) (`next-auth`), Credentials provider, JWT sessions |
| Object storage | [MinIO](https://min.io) (S3-compatible), run via Docker Compose |
| Password hashing | bcryptjs |
| Package manager | pnpm |

## Architecture

### Authentication

- `lib/auth.config.ts` — edge-safe config (no Prisma/bcrypt) consumed by `proxy.ts`, which replaces Next.js middleware in this version and gates every route except `/login`, `/signup`, and `/api/auth`.
- `lib/auth.ts` — full Auth.js config: Credentials provider that checks a bcrypt hash against `User.password`.
- Sessions are JWT-based (required for a Credentials provider) and carry `id` + `role`, typed via `types/next-auth.d.ts`.
- `app/(auth)/login` and `app/(auth)/signup` are the client-facing forms; `app/api/auth/register` validates and creates new users; `app/api/auth/[...nextauth]` is the Auth.js route handler.

### Data model (`prisma/schema.prisma`)

```prisma
enum Role { PRODUCER ARTIST }

model User {
  id, email, password, name, role
  bio?, avatar?, banner?, theme?
  beats  Beat[]
}

model Beat {
  id, title, bpm?, musicalKey?, price
  audioKey, artKey?, artUrl?, artPreset?
  peaks    Json?     // waveform amplitude data, 0-1 normalized
  durationSec?
  plays, likes, saves, shares, comments   // denormalized counters
  producer  User @relation(...)
  tags      Tag[]
}

model Tag {
  id, name, slug
  type            TagType          // GENRE (default) | STYLE
  useCount                         // beats using this tag
  interestCount                    // users who picked it as a genre
  beats           Beat[]
  interestedUsers User[]           // users whose interests include it
}
```

`lib/beats.ts#getBeats()` is the single source of truth for shaping DB rows into the flat client format used by both the server-rendered feed (`app/page.tsx`) and `GET /api/beats`.

### File uploads (direct-to-storage)

No file ever passes through the Next.js server:

1. Client requests a presigned URL: `POST /api/uploads/presign` (`app/api/uploads/presign/route.ts`) — validates auth, role (`PRODUCER` only), MIME type, and file size against the limits in `lib/storage.ts`.
2. Client `PUT`s the file straight to MinIO using the presigned URL (`lib/upload-client.ts#uploadWithProgress`, XHR with progress events).
3. Client computes audio duration and waveform peaks locally (Web Audio API), then `POST /api/beats` with the object key + metadata (`app/api/beats/route.ts`).

Storage keys are namespaced `audio/{userId}/{uuid}.{ext}` and `artwork/{userId}/{uuid}.{ext}` (`lib/storage.ts#buildKey`). Audio is private and served via short-lived presigned GET URLs; artwork is served from a public-read bucket.

| Kind | Allowed types | Max size |
|---|---|---|
| Audio | mp3, wav, aiff, flac | 250 MB |
| Artwork | png, jpg, gif, webp, mp4, webm | 20 MB |

If a producer skips artwork upload, `artPreset` stores one of 6 built-in gradient presets (`components/app/artwork-slot.tsx`) and the feed renders that CSS gradient instead of an image.

### Waveform

- **At upload:** `lib/upload-client.ts#computePeaksFromBuffer()` decodes the audio via the Web Audio API, samples 128 bars, and normalizes each to the loudest peak (0–1 range). Stored as `Beat.peaks` (JSONB).
- **In the feed:** `components/app/waveform.tsx` renders 128 mirrored bars (played bars lime, unplayed white/25%), supports click/drag seeking via pointer capture, and shows elapsed/total time.
- **Fallback for old beats:** if a beat has no stored `peaks` (e.g. seeded data), `components/app/feed.tsx` fetches the beat's presigned audio URL on first view and computes peaks client-side, caching the result in memory (`peaksCache`) so it's only computed once per session.

## Getting Started

### Prerequisites

- **Node.js 20+** — [download here](https://nodejs.org) (LTS is fine)
- **pnpm** — install with `corepack enable` then `corepack prepare pnpm@latest --activate`, or `npm install -g pnpm`
- **Docker Desktop** — [download here](https://www.docker.com/products/docker-desktop/) (runs PostgreSQL + MinIO, recommended path)
- That's it — the database and object storage both run in Docker below. If you'd rather install PostgreSQL natively, see [Running PostgreSQL without Docker](#running-postgresql-without-docker).

### 1. Environment variables

Copy the template and fill in the secret:

```bash
cp .env.example .env
```

Then edit `.env` and set `AUTH_SECRET` (any random string; generate one with `openssl rand -base64 32` — on Windows, run that in Git Bash, or just paste any long random string). The defaults for Postgres and MinIO match `docker-compose.yml`, so nothing else needs to change. The resulting file should look like:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prod4me"
AUTH_SECRET="<a long random string>"

# Optional — defaults shown match docker-compose.yml
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_AUDIO=beat-audio
MINIO_BUCKET_ARTWORK=beat-artwork
```

`STRIPE_SECRET_KEY` (test mode) is optional — without it, paid checkout is disabled but everything else works.

> **Note:** the database **must have the [pgvector](https://github.com/pgvector/pgvector) extension** — the recommendation system stores 256-dimension tag/taste vectors (see the `add_pgvector_tag_vectors` migration). A plain vanilla Postgres will fail on `prisma migrate deploy`. The Docker image below (`pgvector/pgvector:pg17`) ships with it preinstalled; for native installs, see the per-OS notes.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Start PostgreSQL + object storage

```bash
docker compose up -d
```

This starts:

| Service | Container | What it runs |
|---|---|---|
| PostgreSQL 17 + pgvector | `prod4me-postgres` | DB `prod4me`, user `postgres`, password `postgres` — port **5432** |
| MinIO | `prod4me-minio` | S3 API on **:9000**, console on **:9001** |
| MinIO init | `prod4me-minio-init` | one-shot: creates the `beat-audio` (private) and `beat-artwork` (public-read) buckets |

Verify it's healthy:

```bash
docker compose ps          # postgres + minio should show "healthy"
docker compose logs minio-init   # should say "MinIO initialized: buckets created..."
```

#### Running PostgreSQL without Docker

If you prefer a native PostgreSQL install (or can't use Docker for it), install **PostgreSQL 15+ plus the pgvector extension**, create the database, and point `DATABASE_URL` at it. Install/start commands per OS:

**macOS (Homebrew)**

```bash
brew install pgvector
brew services start postgresql@17      # starts now + on login; use `stop` to stop
createdb prod4me                       # pgvector is available to CREATE EXTENSION immediately
```

**Windows** — install [PostgreSQL](https://www.postgresql.org/download/windows/) (the EDB installer), then the [pgvector Windows build](https://github.com/pgvector/pgvector#windows) (`nmake /f Makefile` needs VS Build Tools, or copy prebuilt DLLs). Alternatively use WSL2: `sudo apt install postgresql-17 pgvector...`. Start it and set it to auto-run:

```powershell
# Start / stop / auto-start the "postgresql-x64-17" Windows service:
net start postgresql-x64-17
net stop  postgresql-x64-17
sc config postgresql-x64-17 start=auto
# Create the database (run in PowerShell, postgres superuser):
& "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres prod4me
```

**Linux (Debian/Ubuntu)**

```bash
sudo apt install postgresql postgresql-contrib postgresql-17-pgvector  # package name varies; pgvector is in PGDG repos
sudo systemctl enable --now postgresql    # starts now + on boot
sudo -u postgres createdb prod4me
```

Then update `.env` with your local credentials, e.g. `DATABASE_URL="postgresql://postgres:<your-password>@localhost:5432/prod4me"`, and run the migration — it will run `CREATE EXTENSION vector` itself. If it errors with `could not open extension control file .../vector.control`, pgvector isn't installed for that Postgres — that's the error to fix before continuing.

**Where the data lives:** Docker stores it in the `postgres-data` named volume (survives `docker compose down`; wiped only by `docker compose down -v`). Native installs store it in the standard data directory per OS.

### 4. Set up the database

```bash
pnpm exec prisma migrate deploy   # apply migrations (also enables the pgvector extension)
pnpm seed                          # optional: seed demo producers + beats
```

### 5. Run the dev server

```bash
pnpm dev
```

App runs at [http://localhost:3000](http://localhost:3000).

### Seed accounts (password: `password123`)

| Email | Role |
|---|---|
| `producer@test.com` | PRODUCER |
| `artist@test.com` | ARTIST |

Seeded beats reference placeholder audio keys that don't exist in MinIO, so they show "No audio" and a flat waveform until re-uploaded through the UI.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start the Next.js dev server |
| `pnpm build` | Production build |
| `pnpm start` | Start the production server (after `build`) |
| `pnpm seed` | Seed demo producers, beats, and tags |
| `pnpm seed:dump` | Seed the full recommendation demo dataset |
| `pnpm seed:dump:clean` | Wipe the recommendation demo dataset |
| `pnpm exec prisma migrate deploy` | Apply pending DB migrations |
| `pnpm exec prisma studio` | Browse the database in a local web UI |

## Deploying to Vercel

You don't need any of the local setup above to use the app in production — Vercel hosts the Next.js app, a cloud Postgres holds the data, and Cloudflare R2 holds the files. Everything below is a one-time setup; after that, **every push to GitHub redeploys automatically**, so you can edit from GitHub's web editor, this laptop, or any machine.

Architecture: **Vercel** (Next.js app + API routes) → **Neon** (serverless Postgres with pgvector) and **Cloudflare R2** (S3-compatible file storage). Files still go browser → presigned URL → R2 directly, never through the server.

You'll need free accounts on [Vercel](https://vercel.com), [GitHub](https://github.com), [Cloudflare](https://dash.cloudflare.com/sign-up), and — optionally — [Stripe](https://stripe.com).

### 1. Push the repo to GitHub

```bash
git remote add origin https://github.com/<you>/prod4me.git
git push -u origin main
```

### 2. Provision the database (Neon)

Easiest: in the Vercel dashboard → your project → **Storage** → create a **Neon** database. Neon supports pgvector (your migrations enable it automatically) and Vercel injects `DATABASE_URL` for you. Alternatively create it directly at [neon.tech](https://neon.tech) and copy the **pooled** connection string yourself.

Run the migrations and optional seed from this laptop against the cloud DB:

```bash
DATABASE_URL="<neon pooled connection string>" pnpm exec prisma migrate deploy
DATABASE_URL="<neon pooled connection string>" pnpm seed    # demo accounts + beats
```

### 3. Create R2 buckets (Cloudflare)

In the Cloudflare dashboard → **R2**:

1. Create two buckets: `beat-audio` and `beat-artwork`.
2. On `beat-artwork`: Settings → **Public access** → connect the `r2.dev` subdomain (e.g. `pub-abc123.r2.dev`) — this is what serves artwork images.
3. `beat-audio` stays private; audio is served via short-lived presigned URLs.
4. On **both** buckets: Settings → CORS policy — the browser must be allowed to PUT/GET cross-origin:

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://<your-app>.vercel.app"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. Account-level: **R2 → Manage API tokens** → create a token with *Object Read & Write* scoped to these buckets. You get an Access Key ID + Secret (S3 credentials) and the account-specific endpoint: `https://<accountid>.r2.cloudflarestorage.com`.

### 4. Deploy on Vercel

Dashboard → **Add New… → Project** → import the GitHub repo → set Environment Variables (all environments):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (auto-set if provisioned via Vercel Storage) |
| `AUTH_SECRET` | `openssl rand -base64 32` — **different from local** is fine, but changing it invalidates existing sessions |
| `MINIO_ENDPOINT` | `<accountid>.r2.cloudflarestorage.com` (no scheme) |
| `MINIO_PORT` | `443` |
| `MINIO_USE_SSL` | `true` |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | R2 API token credentials |
| `MINIO_BUCKET_AUDIO` / `MINIO_BUCKET_ARTWORK` | `beat-audio` / `beat-artwork` |
| `MINIO_PUBLIC_ENDPOINT` | `pub-<hash>.r2.dev` — the artwork public host from step 3 |
| `STRIPE_SECRET_KEY` | optional — live/test key to enable paid checkout |
| `STRIPE_WEBHOOK_SECRET` | optional — see below |

Deploy. If the region picker is available, choose the region nearest your Neon database to keep DB round-trips fast.

### 5. Stripe webhook (if using payments)

Stripe dashboard → Developers → Webhooks → add endpoint `https://<your-app>.vercel.app/api/webhooks/stripe` (checkout.session.completed) → copy the signing secret into `STRIPE_WEBHOOK_SECRET`, then redeploy.

### 6. Editing after launch

Push to `main` → Vercel redeploys (preview URLs are generated for every branch/PR too). Schema changes: edit `prisma/schema.prisma`, run `pnpm exec prisma migrate dev` locally against your dev DB, commit the migration folder, then run `prisma migrate deploy` against Neon before/with the deploy.

## Project Structure

```
app/
  page.tsx                    Server component — auth check, loads user + beats, renders AppShell
  (auth)/login, signup/       Auth forms
  api/
    auth/                     Auth.js handlers + registration
    beats/                    GET (list) / POST (create) beats
    tags/                     GET tag autocomplete
    uploads/presign/          Presigned upload URL issuance

components/app/                Product UI (feed, upload, dashboard, profiles, modals, waveform, ...)
components/ui/                 shadcn primitives

lib/
  auth.ts, auth.config.ts     Auth.js configuration
  prisma.ts                   Prisma client singleton
  beats.ts                    DB → client beat shaping
  storage.ts                  MinIO client, presigning, key building
  upload-client.ts            Browser-side upload + waveform peak computation

prisma/
  schema.prisma
  migrations/
  seed.mjs

proxy.ts                       Route protection (Next.js 16's middleware.ts replacement)
docker-compose.yml              PostgreSQL (pgvector) + MinIO service definitions
```

## Recommendation Algorithm

The feed is personalized server-side. All logic lives in `lib/recommendations/`, and **every tunable number is exported from `lib/recommendations/constants.ts`** — tune there, nothing else hardcodes values.

### Signals

Every user interaction is stored as an `EngagementEvent` and weighted:

| Event | Weight |
|---|---|
| `BUY` (license granted — free claim or paid) | 6 |
| `OFFER` (offer sent) | 6 |
| `FOLLOW_PRODUCER` | 5 |
| `SAVE` | 4 |
| `LIKE` · `COMMENT` | 3 |
| `PLAY_COMPLETE` · `TAG_TAP` | 2 |
| `PLAY_50` (listened past 50%) | 1 |
| `SKIP` (beat visible < 3s) | −2 |

Events older than `EVENT_WINDOW_DAYS` (90) stop counting entirely. Every event's influence halves every `DECAY_HALF_LIFE_DAYS` (30): a week-old like counts ~1.14×, a two-week-old one ~1.30× — **weight × 0.5^(ageInDays / 30)**.

### Score formula

Each candidate beat is scored against the viewer's taste:

```
score = 0.60 × similarity      // cosine between the beat's tagVector and your tasteVector
      + 0.20 × producerAffinity // how much you engage this producer (normalized within the page)
      + 0.10 × recency          // 1 today → 0 at RECENCY_ZERO_DAYS (60)
      + 0.10 × popularity       // event count vs the page's most-engaged beat
      [+ FOLLOW_BONUS 0.15 if you follow the producer]  // capped at 1.0
```

Similarity comes from pgvector: beats carry a 256-dimension multi-hot vector over their tags (`L2-normalized`); users carry an accumulated, decayed `tasteVector` rebuilt after every event. Explore beats are picked so that **none** of their tags touched your taste.

### Feed composition

`GET /api/feed` returns `FEED_PAGE_SIZE` (10) beats: the **8 top-scored** ranked beats plus **2 random exploration beats** (zero-affinity tags), then funneled through the same exclusions — your own beats, anything you engaged within `SEEN_EXCLUSION_DAYS` (7 days), and sold exclusives. Pages page-length repeatedly with an opaque cursor that remembers everything delivered (no session duplicates). If filtering empties the page against small catalogs, it falls back gracefully (relaxed rules, then unowned-first, then anything) — the feed never renders blank.

### Cold start

New users (fewer than `COLD_START_MIN_EVENTS` = 5 events) are ranked by **popularity × recency** instead of similarity until the fifth event lands — after that the full score switches on automatically.

### Tag filtering

`GET /api/feed?tag=<name>` returns only beats carrying that tag (same exclusions, no exploration slots, 404 if the tag is unknown).

### Tuning

Open `lib/recommendations/constants.ts` — `EVENT_WEIGHTS`, `DECAY_HALF_LIFE_DAYS`, `EVENT_WINDOW_DAYS`, `VECTOR_DIM`, `SCORE_WEIGHTS`, `FOLLOW_BONUS`, `FEED_PAGE_SIZE` / `FEED_RANKED_SLOTS` / `FEED_EXPLORE_SLOTS`, `COLD_START_MIN_EVENTS`, `SEEN_EXCLUSION_DAYS`, `RECENCY_ZERO_DAYS`, `CANDIDATE_LIMIT`, and `SKIP_UNDER_MILLIS` — change, save, reload. Verification suites live in `scripts/*.test.ts` (`node --env-file=.env --test scripts/rec.test.ts`) and the demo data is `node --env-file=.env scripts/seed-recommendations.ts` (login: `rec-a@prod4me.dev` / `password123`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `P1001: can't reach database server` | Postgres isn't running — `docker compose up -d postgres` (or start your native service), and check the port/credentials in `DATABASE_URL` match |
| `could not open extension control file .../vector.control` | pgvector isn't installed for your Postgres. Use the `pgvector/pgvector:pg17` Docker image, or install pgvector natively (see above), then rerun `pnpm exec prisma migrate deploy` |
| `Error: P1002 / connection timed out` on first start | Postgres container is still initializing — wait ~10s and retry; check `docker compose logs postgres` |
| Port 5432 or 9000 already in use | Another Postgres/MinIO is bound to that port. Change the **left** side of the port mapping in `docker-compose.yml` (e.g. `5433:5432`) and update `DATABASE_URL` / `MINIO_PORT` in `.env` to match |
| MinIO uploads fail with bucket errors | The `minio-init` one-shot may not have run: `docker compose logs minio-init`, then `docker compose up -d minio-init` to re-run it |
| Login says "no account" | Run `pnpm seed` (accounts are only created by seeding or signup) |
| Stale DB state after schema changes | `docker compose down` keeps data; use `docker compose down -v` to wipe volumes and start fresh (then re-migrate + re-seed) |

## Known Gaps (not yet persisted)

These currently work as local/in-memory state only, not saved to the database:

- Profile edits (bio, theme, banner)
- Likes, saves, shares, comments
- Linked tracks, purchase offers, and inbox messages

## A note on this Next.js version

This project pins a version of Next.js with breaking changes relative to the framework you may know (e.g., `proxy.ts` instead of `middleware.ts`). See [AGENTS.md](./AGENTS.md) and `node_modules/next/dist/docs/` for version-specific conventions before making routing or middleware changes.
