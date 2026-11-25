# Deploying PROD4ME to Railway

This guide takes PROD4ME from a GitHub repo to a running site on Railway. It assumes no Railway experience. Follow the steps in order. The first deploy takes about an hour, most of it spent waiting for DNS.

**What you'll end up with**, all in one Railway project:

| Service | What it is |
|---|---|
| `prod4me` | The Next.js web app (`next start`) |
| `pgvector` | Postgres with the `vector` extension |
| Audio bucket, Artwork bucket | Private S3-compatible storage (Railway Buckets) |
| `cron-expire-offers` | Hourly job: expires offers, cleans up rate limits |
| `cron-leaderboard` | Weekly job: saves last week's leaderboard |

Outside Railway you'll use **Resend** (email), **Stripe** (test mode), and optionally **Twilio** (phone verification).

> Throughout this guide, `prod4me` is the name of the web service and `pgvector` is the name of the database service. If yours are named differently, use your names in every `${{ ... }}` reference.

---

## Before you start

- A Railway account (railway.com) on a plan that includes Buckets and cron services.
- The repo pushed to GitHub, with a branch you'll deploy from (this guide calls it the **production branch**, e.g. `main`).
- A domain you control (e.g. `prod4me.studio`). This is optional for a first test, since the Railway domain works too.
- Node.js 22.18 or newer on your computer (needed for step 7).
- Accounts at resend.com and stripe.com.

---

## 1. Create the project and database

1. In Railway, click **New Project → Empty project**.
2. Click **+ Create → Template**, search for **pgvector**, and deploy the pgvector template (image `pgvector/pgvector:pg18`).
   Don't use the standard "PostgreSQL" service. It isn't guaranteed to include the `vector` extension, and the migrations need it.
3. Wait until the service shows **Active**. Rename it to `pgvector` (service **Settings → Name**) if it isn't already.
4. Confirm the extension works. Open the `pgvector` service, go to the **Data** tab, open the query editor, and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
   ```
   You should see one row with `vector`. If you prefer `psql`, copy `DATABASE_PUBLIC_URL` from the service's **Variables** tab and run `psql "<that url>" -c "CREATE EXTENSION IF NOT EXISTS vector;"`.

   You don't strictly need this step, because the migration `20261103053000_add_pgvector_tag_vectors` runs the same `CREATE EXTENSION`. It's a quick check that you picked the right template.

---

## 2. Create the storage buckets

Railway Buckets are **private**: there are no public bucket URLs. PROD4ME handles this:

- **Images** (artwork, avatars, banners, playlist covers) load through `GET /api/media/<key>`, which replies with a 302 redirect to a presigned URL that's valid for 1 hour. This is turned on with `MEDIA_PROXY=1`.
- **Audio** is never served by that route. It's only reachable through the existing presigned URLs for playback and license downloads.

### 2a. Create two buckets

1. In the project, click **+ Create → Bucket**. Name it `prod4me-audio`. Pick the **same region** you'll run the web service in.
2. Create a second bucket named `prod4me-artwork` in the same region.
3. Open each bucket's **Credentials** tab. You'll see values such as the endpoint, access key ID, secret access key, region, and bucket name. The exact variable names are shown on that tab, typically `ENDPOINT`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, and `BUCKET`.

> **If each bucket has its own access key:** the app uses one key pair (`MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`) for both buckets. If the artwork bucket's key can't access the audio bucket (uploads of audio fail with `AccessDenied`), use **one bucket for both**: set `MINIO_BUCKET_AUDIO` and `MINIO_BUCKET_ARTWORK` to the same bucket name. This is safe. Audio keys start with `audio/` and the media route only serves `artwork/`, `avatars/`, and `banners/`, so audio stays private.

### 2b. Apply the CORS rule

Browsers upload directly to the bucket (presigned PUT) and play audio from it, so both buckets need a CORS rule. The rule is in [`docs/bucket-cors.json`](docs/bucket-cors.json).

1. Edit `docs/bucket-cors.json` and replace `https://prod4me.studio` with your real `APP_URL`. Add your `*.up.railway.app` domain as a second origin too if you'll use it. Keep `http://localhost:3000` only if you want to test against the production buckets from your computer.
2. Apply it with the AWS CLI (it works with any S3-compatible storage). Install it from https://aws.amazon.com/cli/, then run this for **each** bucket (Git Bash or macOS/Linux terminal), with values from that bucket's Credentials tab:
   ```bash
   export AWS_ACCESS_KEY_ID="<access key id>"
   export AWS_SECRET_ACCESS_KEY="<secret access key>"
   aws s3api put-bucket-cors \
     --bucket "<bucket name>" \
     --cors-configuration file://docs/bucket-cors.json \
     --endpoint-url "<endpoint, e.g. https://...>" \
     --region "<region>"

   # check it
   aws s3api get-bucket-cors --bucket "<bucket name>" --endpoint-url "<endpoint>" --region "<region>"
   ```
   If the bucket's page in Railway has its own CORS setting, you can enter the same rule there instead.

> Buckets are created by hand here. The app never creates buckets or changes bucket policies at runtime. The `minio-init` container in `docker-compose.yml` is for local development only.

---

## 3. Create the web service

### 3a. Deploy from GitHub

1. Click **+ Create → GitHub Repo** and pick the PROD4ME repo. Railway starts a first build. It's fine if that build fails because variables are missing.
2. Rename the service to `prod4me` (**Settings → Name**).
3. **Settings → Source**: set the branch to your production branch.
4. **Settings → Deploy**:
   - **Pre-deploy Command:** `pnpm db:deploy`
   - **Healthcheck Path:** `/api/health`
   - Leave the **Start Command** empty. Railway runs `pnpm start` (`next start`), which listens on Railway's `PORT` and on all interfaces automatically.

**Why migrations run in pre-deploy, not in the build:** the database is on Railway's private network, which isn't available while the app is being built. The pre-deploy command runs after the build, on the private network, with the service's variables, and before traffic moves to the new deploy. If a migration fails, the deploy stops and the old version keeps serving. `prisma` is in `dependencies`, not `devDependencies`, so it's available at that step. `postinstall` runs `prisma generate` during the build.

The healthcheck path tells Railway to switch traffic to a new deploy only once `/api/health` returns `200 {"ok":true,"db":true}`.

### 3b. Generate the secrets

Run each command on your computer and copy the output. Each run prints a new random value.

```bash
# AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# CRON_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

(`openssl rand -base64 32` in Git Bash works too.)

### 3c. Set the variables

Open the `prod4me` service, go to the **Variables** tab, and use **Raw Editor** to paste the block below, then fill in the values. `${{ ... }}` are Railway references. Railway replaces them with the other service's value, so they stay in sync. Replace `ArtworkBucket` / `AudioBucket` with your bucket service names exactly as they appear in Railway, and use the variable names their Credentials tabs show.

```env
# core
DATABASE_URL=${{ pgvector.DATABASE_URL }}
AUTH_SECRET=<generated above>
AUTH_TRUST_HOST=true
APP_URL=https://prod4me.studio
CRON_SECRET=<generated above>
ADMIN_EMAILS=you@example.com

# storage (Railway Buckets)
MINIO_ENDPOINT=${{ ArtworkBucket.ENDPOINT }}
MINIO_ACCESS_KEY=${{ ArtworkBucket.ACCESS_KEY_ID }}
MINIO_SECRET_KEY=${{ ArtworkBucket.SECRET_ACCESS_KEY }}
MINIO_REGION=${{ ArtworkBucket.REGION }}
MINIO_BUCKET_AUDIO=${{ AudioBucket.BUCKET }}
MINIO_BUCKET_ARTWORK=${{ ArtworkBucket.BUCKET }}
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_PATH_STYLE=false
MEDIA_PROXY=1

# email (step 5)
RESEND_API_KEY=re_...
EMAIL_FROM=PROD4ME <no-reply@prod4me.studio>

# payments, test mode (step 6)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# optional: phone verification
# TWILIO_ACCOUNT_SID=AC...
# TWILIO_AUTH_TOKEN=...
# TWILIO_VERIFY_SERVICE_SID=VA...

# optional feature flags
# DEV_PANEL=1
# NEXT_PUBLIC_STUDIO_ENABLED=1
```

Notes:
- `DATABASE_URL` must be the **private** URL (`pgvector.DATABASE_URL`, not `DATABASE_PUBLIC_URL`). It's faster and doesn't cost egress.
- `MINIO_ENDPOINT` can be a full URL. The app strips `https://` itself.
- Every variable is described in [`.env.example`](.env.example).
- **If a required variable is missing, the server refuses to start** and the deploy log shows one message listing all of them, for example:
  ```
  PROD4ME cannot start: 2 required environment variable(s) missing:
    - RESEND_API_KEY
    - APP_URL (or RAILWAY_PUBLIC_DOMAIN)
  ```
- `NEXT_PUBLIC_STUDIO_ENABLED` and `APP_URL` are also read during the build. Railway passes service variables to the build, and changing a variable triggers a redeploy, so this happens automatically.

### 3d. Domain

1. **Settings → Networking → Generate Domain** gives you `something.up.railway.app`. Until you add a custom domain, you can set `APP_URL` to that address (or leave `APP_URL` unset, since the app falls back to `RAILWAY_PUBLIC_DOMAIN`).
2. **Settings → Networking → Custom Domain**: enter `prod4me.studio` (or `www.prod4me.studio`). Railway shows a **CNAME** record. Add it at your DNS provider and wait until Railway shows the domain as verified (it issues the HTTPS certificate itself).
3. Set `APP_URL=https://prod4me.studio` (no trailing slash) and redeploy. Every email link, Stripe redirect, and image URL uses `APP_URL`, never the request's `Origin` header.
4. Update the CORS rule (step 2b) if the origin changed.

---

## 4. Create the cron services

Railway runs cron jobs as **separate services** that start on a schedule (in UTC, at most every 5 minutes), run one command, and exit. They don't read `vercel.json`, which has been removed. The jobs themselves are API routes in the app, protected by `Authorization: Bearer ${CRON_SECRET}`:

| Route | What it does |
|---|---|
| `GET /api/cron/expire-offers` | Marks overdue offers `EXPIRED` and deletes rate-limit rows older than 24h |
| `GET /api/cron/leaderboard` | Saves last week's top 50 beats and producers (does nothing if already saved) |

Offers are also expired the moment any offer-related screen loads, so the hourly job is a backstop, not the only check.

Create two services. For each one:

1. **+ Create → Docker Image**, enter `curlimages/curl`. There's no repo and no build.
2. Rename it (see the names below).
3. **Variables**:
   ```env
   CRON_SECRET=${{ prod4me.CRON_SECRET }}
   APP_URL=${{ prod4me.APP_URL }}
   ```
4. **Settings → Deploy → Custom Start Command** (`sh -c` makes the shell fill in the variables):
   - `cron-expire-offers`:
     ```
     sh -c 'curl -fsS -m 60 -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/expire-offers"'
     ```
   - `cron-leaderboard`:
     ```
     sh -c 'curl -fsS -m 60 -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/leaderboard"'
     ```
5. **Settings → Cron Schedule**:
   - `cron-expire-offers`: `0 * * * *` (every hour, on the hour)
   - `cron-leaderboard`: `5 5 * * 1` (Mondays 05:05 UTC, which is 00:05 Eastern in winter and 01:05 in summer, after the Monday–Sunday week has ended either way)

`curl -f` exits with an error on any non-2xx response, so failed runs show up as failed in the service's cron history. Each run's output (e.g. `{"expired":0,"rateLimitsDeleted":12}`) is in its logs.

**Running a job by hand:** open the cron service and click **Run now** (or redeploy it). From your own computer you can also use the bundled script, which needs no dependencies and exits 1 on failure:

```bash
APP_URL=https://prod4me.studio CRON_SECRET=<secret> node scripts/cron-call.mjs leaderboard
APP_URL=https://prod4me.studio CRON_SECRET=<secret> node scripts/cron-call.mjs expire-offers
# or against your local dev server:
node --env-file=.env scripts/cron-call.mjs expire-offers
```

---

## 5. Email (Resend)

1. In Resend, go to **Domains → Add Domain** and enter your domain (e.g. `prod4me.studio`). Using a subdomain such as `mail.prod4me.studio` keeps email DNS separate.
2. Resend shows DNS records, usually an MX and a TXT (SPF) record for sending, and a TXT (DKIM) record. Add each one exactly as shown at your DNS provider. Adding a DMARC TXT record (`_dmarc`, value `v=DMARC1; p=none;`) is recommended.
3. Click **Verify** in Resend and wait until the domain shows **Verified**. This can take from a few minutes to a few hours.
4. **API Keys → Create API Key** (sending access) and set it as `RESEND_API_KEY`.
5. Set `EMAIL_FROM` to an address on the verified domain, e.g. `PROD4ME <no-reply@prod4me.studio>`.

In production a missing `RESEND_API_KEY` stops the server at startup. The development "print the email to the console" fallback never runs in production, and reset links are never returned in API responses.

---

## 6. Payments (Stripe, test mode)

1. In the Stripe dashboard, make sure **Test mode** is on.
2. **Developers → API keys**: copy the **Secret key** (`sk_test_...`) and set it as `STRIPE_SECRET_KEY`.
3. **Developers → Webhooks → Add endpoint**:
   - **Endpoint URL:** `https://prod4me.studio/api/webhooks/stripe` (your `APP_URL` + `/api/webhooks/stripe`)
   - **Events to send** (these are the events `app/api/webhooks/stripe/route.ts` handles):
     - `checkout.session.completed`
     - `checkout.session.expired`
4. Open the new endpoint, reveal the **Signing secret** (`whsec_...`), and set it as `STRIPE_WEBHOOK_SECRET`.
   This is **not** the same as the `whsec_...` the Stripe CLI prints for `stripe listen` on your computer. Each endpoint has its own secret.

While the key starts with `sk_test_`, the purchase modal and the offer Pay screen show: *"Payments are in test mode. No real money is charged. Use card 4242 4242 4242 4242, any future date, and any CVC."* The notice disappears automatically with a live key.

---

## 7. After the first deploy

### 7a. Check the deploy

1. Open the `prod4me` service's **Deployments** tab. The newest deploy should be **Active**.
2. Visit `https://prod4me.studio/api/health`. You should see `{"ok":true,"db":true}`.

### 7b. Run the backfill scripts once

These rebuild the recommendation vectors and the beat counters from existing data. They only need the database. Railway's private database address isn't reachable from your computer, so the commands use the database's **public** URL.

```bash
# install and log in to the Railway CLI (once)
npm install -g @railway/cli
railway login

# in the repo folder: link to the project (choose the project and the production environment)
railway link

# run both scripts with the pgvector service's variables, pointing DATABASE_URL at the public URL
railway run --service pgvector -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/backfill-beat-vectors.ts'
railway run --service pgvector -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/backfill-beat-counters.ts'
```

On Windows, run these in **Git Bash**. In PowerShell, use this instead:

```powershell
$env:DATABASE_URL = (railway variables --service pgvector --json | ConvertFrom-Json).DATABASE_PUBLIC_URL
node scripts/backfill-beat-vectors.ts
node scripts/backfill-beat-counters.ts
Remove-Item Env:DATABASE_URL
```

On a brand-new database with no beats, both scripts finish immediately. That's expected.

### 7c. Create your admin account

1. Sign up on the site with an email listed in `ADMIN_EMAILS`.
2. Click the verification link in the email (this also confirms Resend works).
3. The sidebar now shows **Dev panel**, with the Analytics area. Dev tools such as the seeder stay hidden in production unless you set `DEV_PANEL=1`.

### 7d. Test the storage setup

This checks presigned uploads, presigned downloads, and the media redirect against the real buckets:

1. **Upload (presigned PUT):** in Settings → Edit profile, upload a profile picture. It should save without errors. If the browser console shows a CORS error, go back to step 2b.
2. **Media redirect:** right-click the avatar, choose "Copy image address" (it looks like `https://prod4me.studio/api/media/avatars/...`), then:
   ```bash
   curl -sI "https://prod4me.studio/api/media/avatars/<...>"
   # expect: HTTP/2 302, cache-control: public, max-age=3000, location: https://<bucket host>/...
   curl -sL -o /dev/null -w "%{http_code} %{content_type}\n" "https://prod4me.studio/api/media/avatars/<...>"
   # expect: 200 image/...
   curl -s -o /dev/null -w "%{http_code}\n" "https://prod4me.studio/api/media/audio/anything.mp3"
   # expect: 404 (audio is never served by this route)
   ```
3. **Upload audio and artwork:** as a producer, upload a beat. Both files should reach 100%.
4. **Playback (presigned GET):** the beat plays in the feed.
5. **License download (presigned GET with attachment):** buy the beat as an artist (step 8) and download the license file.

If uploads fail with `SignatureDoesNotMatch` or the wrong host, check `MINIO_PATH_STYLE=false`, `MINIO_REGION`, `MINIO_PORT=443`, and `MINIO_USE_SSL=true`.

---

## 8. Smoke test checklist

Use two browsers, or one normal and one private window, so you have a producer account and an artist account.

- [ ] Sign up and verify the email (link arrives; the pending screen moves on by itself)
- [ ] Log out, then log in with **email**, then with **username**
- [ ] Producer: upload a beat (audio and artwork both reach 100%)
- [ ] Feed loads; the beat plays; staying on it for 3+ seconds counts a stream (check Insights)
- [ ] Artwork and avatars load. Their addresses start with `/api/media/` (right-click → copy image address)
- [ ] Like and comment on a beat
- [ ] Artist makes an offer → producer counters → artist accepts → **Pay** with `4242 4242 4242 4242` → the license appears in the artist's library → license download works
- [ ] The test-mode notice shows in the purchase modal and on the Pay screen
- [ ] Message between the two accounts (new messages appear within a few seconds)
- [ ] Follow the producer from the artist; the beat shows in the **Following** feed
- [ ] Leaderboard page loads
- [ ] Dev panel → Analytics loads for the admin account (non-admins get a 404 at `/dev`)
- [ ] Forgot password → reset email arrives → reset works
- [ ] Open `cron-expire-offers` in Railway, click **Run now**, and check its log shows `{"expired":…,"rateLimitsDeleted":…}`
- [ ] `/terms`, `/privacy`, `/robots.txt`, and an unknown URL (404 page) load

---

## 9. Updating later

- **Deploy a change:** push (or merge a pull request) to the production branch. Railway builds it, runs `pnpm db:deploy` (new migrations) in the pre-deploy step, waits for `/api/health` to pass, and then switches traffic. The old deploy keeps serving until then.
- **Schema changes:** create migrations locally with `pnpm exec prisma migrate dev --name <change>` and commit the new folder under `prisma/migrations/`. Never edit a migration that has already been deployed.
- **Read the logs:** `prod4me` → **Deployments** → click a deployment:
  - **Build Logs:** install and `next build` output (type errors show here, since the build no longer ignores them).
  - **Deploy Logs:** pre-deploy output (`prisma migrate deploy`) followed by the server's output. A missing-variable error from the startup check appears here.
  - The service's **Logs** / **Observability** tab shows live output from the running server. Anything written to stdout is visible to everyone with access to the project, so never log secrets.
- **Roll back:** **Deployments** → find the last good deployment → **⋮ menu → Rollback**. This restores that build and its variables. It does **not** undo database migrations, so if a migration caused the problem, fix it with a new migration rather than editing the old one.
- **Change a variable:** edit it in the **Variables** tab and click **Deploy** to apply. Railway redeploys with the new value.
