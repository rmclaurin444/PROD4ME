# PROD4ME

A TikTok-style vertical feed for discovering and selling beats. Producers upload tracks with artwork, BPM, key, and price; artists scroll a full-screen feed, preview waveforms, save beats, and negotiate offers.

> Originally generated as a clickable prototype in [v0.app](https://v0.app) (single hardcoded `app/page.tsx`, no backend). Since then it's been rebuilt into a real full-stack app: authentication, a Postgres-backed data model, direct-to-object-storage file uploads, and a real audio waveform.

## Features

- **Two fixed roles at signup** — Producer or Artist, chosen once and enforced everywhere (nav, feed actions, upload access)
- **Vertical beat feed** — full-bleed artwork, autoplay-muted audio, like/save/share/comment counters, tag filtering, wheel-to-advance
- **SoundCloud-style waveform** — real per-track amplitude bars computed client-side from the audio file, click/drag to seek, with an on-demand fallback for beats that predate stored waveform data
- **Beat upload pipeline** — drag-and-drop audio + artwork (or pick from gradient presets), tag autocomplete, direct browser → object storage upload (audio/artwork bytes never pass through the Next.js server)
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
  id, name, slug, useCount
  beats  Beat[]
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

- Node.js + [pnpm](https://pnpm.io)
- Docker Desktop (for MinIO)
- A local PostgreSQL instance

### 1. Environment variables

Create a `.env` file in the project root (gitignored):

```bash
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/prod4me"
AUTH_SECRET="<generate with: openssl rand -base64 32>"

# Optional — defaults shown match docker-compose.yml
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_AUDIO=beat-audio
MINIO_BUCKET_ARTWORK=beat-artwork
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Start object storage

```bash
docker compose up -d
```

This starts MinIO (API on `:9000`, console on `:9001`) and an init container that creates the `beat-audio` (private) and `beat-artwork` (public-read) buckets.

### 4. Set up the database

```bash
pnpm exec prisma migrate deploy   # apply migrations
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
docker-compose.yml              MinIO service definitions
```

## Known Gaps (not yet persisted)

These currently work as local/in-memory state only, not saved to the database:

- Profile edits (bio, theme, banner)
- Likes, saves, shares, comments
- Linked tracks, purchase offers, and inbox messages

## A note on this Next.js version

This project pins a version of Next.js with breaking changes relative to the framework you may know (e.g., `proxy.ts` instead of `middleware.ts`). See [AGENTS.md](./AGENTS.md) and `node_modules/next/dist/docs/` for version-specific conventions before making routing or middleware changes.
