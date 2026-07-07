# Bunny Video Sharing

A small Next.js app for sharing private [Bunny.net Stream](https://bunny.net/stream/) videos with people outside your organization via time-limited, revocable links — without giving them access to your Bunny library.

## How it works

- The admin page (`/`) is protected with HTTP Basic Auth and lists videos from your Bunny Stream library.
- From there you generate a share: pick a video, enter a recipient email and an expiry window, and the app emails them a link like `/watch/<token>`.
- The `/watch/[token]` page is public (not behind Basic Auth) so recipients can open it directly. It checks the token against storage and only renders the video player if the link hasn't been revoked or expired.
- Share records (token, video, recipient, expiry, revoked flag) are stored in Upstash Redis via the REST API.
- Expired/revoked shares can be purged with a cleanup endpoint, suitable for a scheduled job.

## Requirements

- A [Bunny.net](https://bunny.net/) account with a Stream library and pull zone
- An [Upstash](https://upstash.com/) Redis database (REST API), or the equivalent from the Vercel Storage tab
- An SMTP provider for sending share emails (Brevo, SMTP2GO, Gmail app password, etc.)

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values (see below).

3. Run the dev server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) and sign in with `ADMIN_USER` / `ADMIN_PASS`.

## Environment variables

| Variable | Description |
| --- | --- |
| `BUNNY_LIBRARY_ID` | Bunny Stream library ID |
| `BUNNY_API_KEY` | Bunny Stream library API key |
| `BUNNY_TOKEN_KEY` | Bunny token authentication key, used to sign embed URLs |
| `BUNNY_PULL_ZONE` | Bunny Stream pull zone hostname |
| `SITE_URL` | Public base URL used when building share links (falls back to the request host) |
| `ADMIN_USER` / `ADMIN_PASS` | Credentials for Basic Auth on `/` and its API routes |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP settings for sending share emails |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis REST API credentials for storing share records |

## API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/videos` | GET | List videos from the Bunny library |
| `/api/share` | POST | Create a share link and email it to a recipient |
| `/api/shares` | GET | List all share records (for the admin table) |
| `/api/revoke` | POST | Revoke a share by token |
| `/api/cleanup` | POST | Delete expired or revoked share records |

All routes except `/watch/[token]` are protected by the Basic Auth middleware.

## Deployment

Deploys as a standard Next.js app (e.g. on Vercel). Set the environment variables above in your hosting provider, and optionally schedule `/api/cleanup` (e.g. a Vercel Cron job) to periodically purge stale share records.
