# Site Survey App

Full-stack site survey platform with:

- Backend API in Express + TypeScript + PostgreSQL
- Frontend dashboard in React + Vite
- Mobile clients and shared modules in the repository

## Local Development

### Quick Start - Full Stack with Android

1. Install dependencies from the repo root:
   ```bash
   npm install
   ```

2. Start everything (Docker + Backend + Android):
   ```bash
   npm run dev:android
   ```

### Alternative - Backend + Frontend Only

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start local development stack:
   ```bash
   npm run dev:local
   ```

### Mobile Development

For detailed Android setup and troubleshooting, see:
- **[mobile/QUICK_REFERENCE.md](mobile/QUICK_REFERENCE.md)** - Quick command reference
- **[mobile/ANDROID_TROUBLESHOOTING.md](mobile/ANDROID_TROUBLESHOOTING.md)** - Complete troubleshooting guide
- **[mobile/ANDROID_FIX_SUMMARY.md](mobile/ANDROID_FIX_SUMMARY.md)** - Technical implementation details

**Quick commands from mobile directory:**
```bash
npm run android:emulator    # Auto-start emulator and run
npm run android:diagnose    # Check Android setup
npm run android:reset-adb   # Fix device detection issues
```

## Mobile API Target (important for login)

The mobile app signs in against whatever API base URL is active at runtime.
To guarantee mobile login uses the same credentials as the website, point mobile to the same backend origin used by the website (currently `https://solar-pro.app`).

Resolution order in mobile runtime:

1. `EXPO_PUBLIC_API_URL`
2. `expo.extra.apiUrl`
3. inferred local dev fallback (`http://<lan-ip>:3001`, emulator fallback, localhost)

For local Expo runs, create `mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=https://solar-pro.app
```

For EAS preview/production builds and updates, set `EXPO_PUBLIC_API_URL` in EAS environment variables to the same backend URL.

## Production DB Source of Truth (Render)

Backend production should use `DATABASE_URL` (single source) so both website and app API authenticate against the same users table.

- Render service: `site-survey-api`
- Required env var: `DATABASE_URL`
- `render.yaml` keeps `DATABASE_URL` as `sync: false` so the secret is managed in Render dashboard.

If website DB is the master, set Render `DATABASE_URL` to that same database connection string.

## Mobile EAS Builds

The Expo project lives in `mobile/`, so EAS commands must run from that directory. If you run `eas build` from the repo root, EAS will try to read `/eas.json` and fail.

Use one of these repo-root commands instead:

- `npm run eas:build:configure`
- `npm run eas:build`
- `npm run eas:submit`

## SolarPro Webhook + Survey API Integration Snippets

### Webhook event model

`survey.completed` is sent as a **thin event**. Consumers should fetch full survey details via API.

Example payload shape:

```json
{
  "event": "survey.completed",
  "event_id": "uuid",
  "occurred_at": "ISO-8601 timestamp",
  "survey_id": "uuid",
  "status": "submitted",
  "project_id": "uuid|null",
  "project_name": "string",
  "inspector_name": "string",
  "site_name": "string",
  "completed_at": "ISO-8601 timestamp"
}
```

Webhook headers sent by backend:

- `X-Survey-Signature`
- `X-Survey-Timestamp`
- `X-Survey-Event-Id`

Signature format:

- HMAC-SHA256 over `${timestamp}.${rawBody}`
- Header value: `sha256=<hex_digest>`

### End-to-end cURL examples (bash)

#### 1) Sign in and capture tokens

```bash
API_BASE="https://solar-pro.app"

SIGNIN_RESP=$(curl -sS -X POST "$API_BASE/api/users/signin" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "your-user-or-email",
    "password": "your-password"
  }')

echo "$SIGNIN_RESP"
ACCESS_TOKEN=$(echo "$SIGNIN_RESP" | jq -r '.token')
REFRESH_TOKEN=$(echo "$SIGNIN_RESP" | jq -r '.refreshToken')
```

#### 2) Fetch full survey by ID (thin-event follow-up)

```bash
SURVEY_ID="4f2a587d-4d18-4f8c-8f88-9ed6d26ff7c0"

curl -sS "$API_BASE/api/surveys/$SURVEY_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq
```

#### 3) Refresh expired access token

```bash
REFRESH_RESP=$(curl -sS -X POST "$API_BASE/api/users/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")

echo "$REFRESH_RESP"
ACCESS_TOKEN=$(echo "$REFRESH_RESP" | jq -r '.token')
REFRESH_TOKEN=$(echo "$REFRESH_RESP" | jq -r '.refreshToken')
```

#### 4) Build webhook signature locally (verification fixture)

```bash
WEBHOOK_SECRET="whsec_test_47_435"
TIMESTAMP="2026-04-23T18:25:43.000Z"
EVENT_ID="8d7f7a5d-8a84-4ec2-96a8-f0db57876fe8"

RAW_BODY='{"event":"survey.completed","event_id":"8d7f7a5d-8a84-4ec2-96a8-f0db57876fe8","occurred_at":"2026-04-23T18:25:43.000Z","survey_id":"4f2a587d-4d18-4f8c-8f88-9ed6d26ff7c0","status":"submitted","project_id":"a0d89f6f-9a65-4bd6-b724-2ea2935f0dc9","project_name":"Solar Farm East","inspector_name":"Taylor Reed","site_name":"Parcel 17","completed_at":"2026-04-23T18:25:41.382Z"}'

SIGNATURE_HEX=$(printf "%s.%s" "$TIMESTAMP" "$RAW_BODY" \
  | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex \
  | sed 's/^.* //')

SIGNATURE="sha256=$SIGNATURE_HEX"
echo "$SIGNATURE"
```

#### 5) Send signed webhook request to receiver

```bash
RECEIVER_URL="https://your-solarpro-host/api/webhooks/survey-complete"

curl -i -X POST "$RECEIVER_URL" \
  -H "Content-Type: application/json" \
  -H "X-Survey-Timestamp: $TIMESTAMP" \
  -H "X-Survey-Event-Id: $EVENT_ID" \
  -H "X-Survey-Signature: $SIGNATURE" \
  --data-raw "$RAW_BODY"
```

### Backend configuration for webhook delivery

Set in `backend/.env` (production):

- `SOLARPRO_WEBHOOK_URL` (base URL of receiver; backend posts to `/api/webhooks/survey-complete`)
- `SURVEY_WEBHOOK_SECRET` (shared HMAC secret)

## Security Checklist

- Set a strong JWT secret in backend/.env before production deployment.
- Keep JWT expiration short enough for your risk profile.
- Restrict CORS origins to trusted frontend and mobile hosts only.
- Use HTTPS and secure reverse-proxy headers in production.
- Rotate secrets and credentials regularly.
- Monitor auth audit logs for repeated failures and lockouts.

## Auth and Rate-Limit Controls

Configured in backend/.env:

- JWT_SECRET
  - Secret used to sign and verify auth tokens.
- JWT_EXPIRES_IN
  - Token lifetime (example: 12h).

- SIGNIN_MAX_FAILURES
  - Number of invalid sign-in attempts allowed before lockout.
- SIGNIN_WINDOW_MINUTES
  - Rolling window used to count failures.
- SIGNIN_LOCK_MINUTES
  - Lockout duration once threshold is reached.

- USERS_REGISTER_MAX_REQUESTS
  - Max register requests allowed for a request key in the configured window.
- USERS_REGISTER_WINDOW_MINUTES
  - Window for register route throttling.

- USERS_ME_MAX_REQUESTS
  - Max requests allowed to GET /api/users/me per window.
- USERS_ME_WINDOW_MINUTES
  - Window for users/me route throttling.

## Auth Audit Logging

The backend emits structured auth audit logs for:

- Register attempts, conflicts, successes, and failures
- Sign-in attempts, failures, lockouts, successes, and failures
- Authenticated profile access via GET /api/users/me

Sensitive identifiers are redacted:

- Email values are logged as hashes with domain preserved.
- IP addresses are truncated.
