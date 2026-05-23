# AGENTS.md

## Scope and terminology
- Use **app** for this repository and **website** for Raymond's SolarPro system (`.github/copilot-instructions.md`).
- Treat website DB as credential source-of-truth and app DB as target when reconciling users (`docs/user-credential-reconciliation.md`).
- Execute multi-step work autonomously; do not pause for confirmations unless blocked (`.github/copilot-instructions.md`).
- **Never add, remove, or modify environment variables** (in `.env`, `render.yaml`, Render dashboard, Vercel dashboard, or any config file) without explicit user permission.
- **Structured Survey Pipeline**: All survey capture must adhere to the 5-step CAD-Ready architecture (Arrival, Walkaround, Utility, Electrical, Roof) defined in `.github/copilot-instructions.md`.

## System map (what talks to what)
- `mobile/` (Expo Router) calls backend via `mobile/src/api/client.ts` (`/api/users`, `/api/surveys`, `/api/handoff`, `/api/bug-reports`, `/api/categories`, `/api/mobile`).
- `backend/` is the API boundary (`backend/src/index.ts`), with auth in `routes/users.ts` and survey domain in `routes/surveys.ts`.
- `routes/mobileClients.ts` at `/api/mobile` proxies client/project lookups to SolarPro with user-scoped `X-Mobile-User-Email` header; multi-strategy auth: `MOBILE_SERVICE_API_KEY` → `SOLARPRO_API_KEY` → `PARTNER_API_KEY` → minted JWT from `SOLARPRO_HANDOFF_SECRET`.
- `routes/categories.ts` at `/api/categories` serves survey category lookup (requireAuth).
- `frontend/` is a lightweight Vite dashboard (`frontend/src/App.tsx`) and is secondary to mobile workflows.
- Postgres is primary app storage (`backend/src/database.ts`), with PostGIS location support used in survey routes.
- Optional outbound/integration workers start on boot: webhook queue + SQL Server mirror + photo retention scheduler (`startWebhookWorker`, `startSqlServerSyncWorker`, `startPhotoRetentionScheduleWorker` in `backend/src/index.ts`).

## Runtime and environments
- Local API dev defaults to `http://localhost:3001` (`backend/src/index.ts`, `mobile/src/api/client.ts`).
- Docker compose backend exposes port `3000`, while local ts-node backend uses `3001`; pick one stack and align mobile API URL.
- Mobile API base URL resolution order: `EXPO_PUBLIC_API_URL` -> `expo.extra.apiUrl` -> inferred LAN/emulator fallbacks (`mobile/src/api/client.ts`).
- Production backend should use `DATABASE_URL` (Render service `site-survey-api`, `render.yaml`).

## Daily developer workflows
- Install all deps: `npm run install:all` (repo root `package.json`).
- Full Android-oriented startup: `npm run dev:android` (runs Docker DB, backend dev server, then emulator via `scripts/start-full-stack.js`).
- Backend + mobile local flow: `npm run dev:local` (auto-writes `mobile/.env` and patches backend CORS via `scripts/setup-local.js`).
- Backend tests: `npm test --prefix backend` (Jest + ts-jest; tests in `backend/src/__tests__`).
- Production build artifacts: `npm run build --prefix backend` then `npm start --prefix backend`.
- Deploy backend to Render: `npm run deploy:backend` (runs `scripts/deploy-render.ps1`).
- Deploy everything: `npm run deploy:all` (Render backend + EAS OTA update to production branch).

## Project-specific coding patterns
- Backend uses "self-healing" schema guards (`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... IF NOT EXISTS`) in route/service startup paths (e.g., `routes/surveys.ts`, `services/webhookService.ts`, `routes/webhooks.ts`).
- Survey completion is idempotent: `POST /api/surveys/:id/complete` reuses existing `survey.completed` event if already queued (`routes/surveys.ts`).
- Webhook payloads are signed over `${timestamp}.${rawBody}` and verified against `X-Survey-*` headers (`services/webhookService.ts`, `routes/webhooks.ts`).
- Auth is website-backed: user CRUD/verification goes through `services/sqliteAuthStore.ts` (despite name, it uses Postgres pools).
- Refresh tokens are stored hashed in app DB table `refresh_tokens`; access token refresh is implemented in both backend and mobile client retry logic.
- Startup env validation: `lib/envGuard.ts` runs `runEnvGuard()` before the server accepts traffic; it calls `process.exit(1)` if any fatal var (`JWT_SECRET`, `DATABASE_URL`, `SOLARPRO_API_URL`, `SOLARPRO_WEBHOOK_URL`, `SOLARPRO_HANDOFF_SECRET`, `SURVEY_WEBHOOK_SECRET`) is missing or malformed. Do not bypass.
- Photo serving: `GET /api/surveys/photos/:photoId` is intentionally registered **before** `requireAuth` so SolarPro can fetch photo URLs without a Bearer token (`backend/src/index.ts`).
- Photo retention purge: two-stage nightly job (01:00 CT) via `services/photoRetentionScheduleService.ts`. Stage A clears blobs after `PHOTO_RETENTION_STAGE_A_HOLD_DAYS` (default 7); Stage B full-purge after `PHOTO_RETENTION_STAGE_B_HOLD_DAYS` (default 30). Run manually via `backend/src/scripts/photoRetentionPurge.ts`. Disable with `PHOTO_RETENTION_SCHEDULE_ENABLED=false`.
- In-process metrics: `services/metrics.ts` tracks counters/timers; `GET /api/metrics` (admin role required) returns a snapshot.
- APK release endpoint: `GET /release/latest.apk` resolves via `services/releaseAssetService.ts` — prefers `LATEST_APP_APK_URL` env var, then queries GitHub Releases API (cached 5 min). Configured via `GITHUB_RELEASE_OWNER`, `GITHUB_RELEASE_REPO`, `GITHUB_RELEASES_TOKEN`.

## Integrations and external contracts
- Webhook sender config: `SOLARPRO_WEBHOOK_URL` + `SURVEY_WEBHOOK_SECRET`; receiver endpoint is `/api/webhooks/survey-complete`.
- SQL Server mirror is opt-in via `SQLSERVER_SYNC_ENABLED=true`; sync checkpoint stored in `external_sync_state` (`services/sqlServerSyncService.ts`).
- Storage backend switch: `STORAGE_BACKEND=local|s3`; S3 mode needs AWS env vars and returns presigned GET URLs (`utils/storageClient.ts`).
- Handoff/SSO depends on `SOLARPRO_HANDOFF_SECRET` (`routes/handoff.ts`, `routes/users.ts` `/solarpro-sso`).
- SolarPro proxy: `SOLARPRO_API_URL` (base URL, fatal if missing) + `MOBILE_SERVICE_API_KEY` (preferred service-to-service bearer); legacy aliases `SOLARPRO_API_KEY` / `PARTNER_API_KEY` are accepted; `SOLARPRO_HANDOFF_SECRET_FALLBACKS` (comma-separated) for rolling secret rotation (`routes/mobileClients.ts`).
- CORS: allowed origins read from `ALLOWED_ORIGINS` (comma-separated); defaults include `localhost:5173`, `localhost:4173`, `localhost:8081`.

## Credential reconciliation workflow
- Use `backend/src/scripts/reconcileUsers.ts` for website -> app user sync; run dry-run first, then `--apply`.
- Default safe behavior is hash-sync of missing users; optional `--sync-mismatch` updates app hashes/names to website values.
- Do not perform manual password resets unless explicitly requested; prefer reconciliation flows documented in `docs/user-credential-reconciliation.md`.

