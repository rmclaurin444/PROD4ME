# What Changed — Plain-Language Summary

_(Written for non-code-reading review. Technical details live in `SESSION.md`; this document explains the "why" and "what it does for you")_

---

## The big picture

Since the computer reset, the app was brought back from scratch and a complete **personalized recommendation system** was added. Everything below happened in this order:

1. The machine was rebuilt (tools, database, storage, env files) — see "Infrastructure recovery".
2. Signup gained a genre-picking step, so users teach the system what they like from day one.
3. Every meaningful action in the app (plays, likes, saves, offers, purchases, skips, comments…) is now recorded and turned into a personal taste profile.
4. The feed now uses that profile to order beats — users with different histories see different feeds — plus explore slots for discovery, and tag search.
5. Seed data for demoing all of it, plus an automated test suite that verifies the math.

---

## 1. Infrastructure recovery (day one)

The reset wiped everything except the code. We rebuilt: Node + pnpm, PostgreSQL 18 (installed locally, database rebuilt by replaying migrations + seeding demo data), MinIO (image storage, running in Docker from the saved images), the `.env` secrets restored from your backup, and Stripe's CLI listener. **Postgres lives in `C:\pgdata\prod4me` and must be started after a reboot** (`C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe -D C:\pgdata\prod4me start`). Upload a complaint if that feels fragile — it can be registered as a Windows service.

## 2. Signup now asks artists for genres

- Signing up as an **artist** is now a 3-step wizard: details → role → "what genres are you into?" (up to 6, free-form typing like the beat tag system, a "Popular" chip list, completely skippable).
- **Producers** are unaffected (2 steps).
- These picks are stored and are the earliest signal for recommendations.
- Tag input bug fixed along the way: typing your own tag and pressing Enter used to get hijacked into accepting a "previously used" suggestion. Now Enter commits your text; suggestions are picked by clicking or arrow-keys only.

## 3. The engagement tracker (what the system "sees")

Every interaction writes one row to an `EngagementEvent` table. What counts, and how strong the signal is:

| Action | Weight |
|---|---|
| Buying a beat (even free ones) | 6 |
| Sending an offer | 6 |
| Following a producer | 5 |
| Saving | 4 |
| Liking / Commenting | 3 |
| Listening past halfway / tapping a tag | 2 |
| Quickly skipping past a beat (<3 seconds) | −2 (mild dislike) |

Everything is recorded silently — the app never waits on tracking, and if tracking fails nothing in the user experience changes. Recent events count more: every 30 days of age halves an event's influence, and anything older than 90 days stops mattering. Buying a beat and adding it to your library is recorded at the moment the license is actually granted — so even if you close the browser mid-payment and the webhook completes later, the purchase still counts.

## 4. The taste profile

Each user gets a **256-dimension "taste vector"** — think of it as a fingerprint where each slot represents a tag. Beats it liked push slots up; skips push them down. The fingerprint is rebuilt automatically after each event. Beats themselves get their own small vector listing their tags. The math machinery (`pgvector`) had to be installed into your local Postgres from a community Windows build — noted as fine for development.

## 5. The personalized feed

`GET /api/feed` now powers the "Discover" screen:

- **8 beats ranked for you** (personal relevance) + **2 random "explore" beats** picked specifically from tags you've shown zero interest in — so discovery is guaranteed, not accidental.
- **Old-and-seen self-hides:** beats you've interacted with in the last 7 days stop reappearing; sold exclusives and your own uploads never show.
- **Cold start:** fewer than 5 events → the feed falls back to "popular and fresh" ranking until the 5th event, then personal scoring turns on automatically.
- **Paging:** scrolling past the end fetches the next page; beats already shown never repeat within one visit.
- **Tag pills:** tapping a tag switches the feed to that tag only (tap the dismissible chip to go back). Unknown tags 404.
- **Never-blank guarantee, three layers:** if the strict rules would empty the page (which happened — you had SKIPped on every beat you own), a relaxed ranking kicks in, then an even more relaxed one, and even the UI itself has a final fallback that renders beats even if the recommendation engine momentarily fails.

Two users on the same screen now see genuinely different orderings, driven by what they've clicked.

## 6. Producer profiles (quality-of-life fixes)

- Clicking a producer's name in the feed now opens **their real profile with their actual beats** (previously a hard-coded mock array).
- The four fake "placeholder" beats with broken audio were removed permanently — beats now only exist via real uploads. (Two test producer accounts `producer1@test.com` / `producer2@test.com`, password `password123`, exist for uploading.)

## 7. Seed data + tests (this task)

- `node --env-file=.env scripts/seed-recommendations.ts` creates **3 demo viewers** (`rec-a@prod4me.dev`, `rec-b@prod4me.dev`, `rec-c@prod4me.dev`, password `password123`), **2 producers**, **30 beats across 6 fictional tags**, and a scripted history (likes, saves, plays, one skip + one producer-follow each) — user A loves trap/drill, B house/techno, C ambient/lofi. Vectors are rebuilt automatically. Logs in directly; also `--clean` to wipe just those fixtures.
- The fixture engagement is deliberately scripted so each user still has ~5 unseen beats carrying their favorite tags — the ranking assertions are then deterministic.
- **16 automated tests** (`node --env-file=.env --test scripts/rec.test.ts` — 6; `scripts/feed.test.ts` — 4; `scripts/scoring.test.ts` — 6) verify: taste-driven top-5 placement, exact page composition (10 = 8 ranked + 2 explore), exclusions, the follow bonus and its 1.0 cap, the cold-start threshold switch, tag filtering (with unknown-tag rejection), no duplicate beats across pages, and empty-feed covenant for unknown taste vectors. All pass today, plus `tsc` typecheck.

## 8. Known limitations (documented, by design)

- **Follows** still aren't a database concept (the "Follow" button is UI-only today) — so the follow bonus is testable and wired, but awaits a `Follow` table + follow API before it does anything real.
- LIKE/SAVE dedupe is "detect the duplicate and ignore", not a database constraint — a race can rarely double-write.
- Producer affinity counts your events on *any* beat by that producer, not just the ones on the current page.
- The popularity metric uses events from the last 90 days only.

## 9. Where the code lives

| Piece | Location |
|---|---|
| All tunables | `lib/recommendations/constants.ts` |
| Event recording | `app/api/events/route.ts` |
| Vectors | `lib/recommendations/vectors.ts` |
| Ranking | `lib/recommendations/scoring.ts` |
| Feed page assembly | `lib/recommendations/feed.ts` |
| Feed endpoint | `app/api/feed/route.ts` |
| UI wiring | `components/app/app-shell.tsx` + `components/app/feed.tsx` |
| Seeds | `prisma/seed.mjs`, `scripts/seed-recommendations.ts` |
| Tests | `scripts/rec.test.ts`, `scripts/feed.test.ts`, `scripts/scoring.test.ts` |
| Deep-dive notes | `SESSION.md` (every decision & interpretation, per task) |
