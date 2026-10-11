# Site Survey App — IdentityLink contract

**Version:** 1.0 (F-18 Step 1, additive docs only — no code change)
**Date:** 2026-06-23
**Author:** blake (drafted for JAMES sign-off)
**Spec:** `C:\Users\carpe\.minimax-agent\projects\Solarpro\F18-SPEC.md` @ `64cc6691`

---

## What this document is

This is the canonical contract for how user identity flows between
the **website** (SolarPro / Next.js on Vercel, Neon PostgreSQL
source-of-truth) and the **app** (Site Survey mobile + Express backend
on Render). It exists so any future agent working on either side of
the integration knows exactly what fields mean, who owns them, and
when they refresh.

F-18 introduced this contract to fix a silent-drift bug: the `surveys`
table on both the mobile SQLite (local cache) and the app's Render
Postgres (server) carried denormalized columns (`solarpro_user_id`,
`solarpro_email`, `solarpro_project_id`, `solarpro_org_id`) that
duplicated Neon user data. When a Neon user was deleted, renamed, or
had their email changed, the app-side copies went stale silently.
This contract makes the ownership explicit and lays the groundwork for
removing the snapshot columns in F-18 Steps 4 + 6.

---

## The contract — three rules

### Rule 1 — `solarpro_user_id` is the only authoritative identity reference on the app side

`mobile.surveys.solarpro_user_id` and `app_db.surveys.solarpro_user_id`
both reference **the Neon `users.id` UUID** (the website's primary key
on `ep-jolly-shadow-a8j1n17p-pooler.eastus2.azure.neon.tech`).

- **Stable** for the lifetime of the user. Never null for surveys
  created via the SolarPro SSO handoff flow (see
  `docs/HANDOFF_SOLARPRO_ONLY_AUTH.md`).
- **Only authoritative identity reference** between the website
  Neon database and the app. Everything else (display name, email,
  role) is derived from a JOIN / lookup, not duplicated.
- **No FK constraint** exists at the database level (Neon and the
  app Postgres are separate databases). Treat it as
  "FK-by-convention" — if a Neon user is deleted, surveys in the app
  may now reference a non-existent user. This is an accepted failure
  mode for the in-flight F-18 work; future agent must surface orphan
  references before any hard delete in Neon.

### Rule 2 — `solarpro_email` and `solarpro_project_id` are SNAPSHOTS, not references

These two columns on `mobile.surveys` and `app_db.surveys` are
**point-in-time values captured at survey submission time**. They are
NOT refreshed from Neon.

- If a Neon user's email changes, every survey they previously
  submitted keeps the OLD email in `solarpro_email`. That's by
  design — the survey is a historical record.
- If a project in Neon is renamed, surveys linked to it keep the
  old project name in `solarpro_project_id`. Same reason.
- These columns are **deprecated as of F-18 Step 4** (app backend
  migration `003_drop_inspector_name_and_snapshot_columns.sql`).
  The drop targets `solarpro_email`, `solarpro_project_id`, and
  `solarpro_org_id`. Until that migration lands, treat them as
  read-only historical fields.

### Rule 3 — `inspector_name` is a derived field, not a stored column

The free-text `inspector_name` column on `mobile.surveys` and
`app_db.surveys` is being replaced by a derivation:

```
inspector_name = users_cache.full_name ?? "Unknown"
```

where `users_cache` is a new mobile-side SQLite table (F-18 Step 2)
populated from `/api/users/me` and SSO exchanges. The derivation
provides:

- A live display value when the device is online.
- A cached fallback when offline (TTL: 24h, refreshed on next
  online action).
- A graceful "Unknown" when the cache is stale and offline.

The free-text `inspector_name` column is **removed from the mobile
schema in F-18 Step 3** and **dropped from the app Postgres `surveys`
table in F-18 Step 4**. The website's `projects.inspector_name` /
`project_physical_data` columns are researched in Step 6 to see if
any consumer (proposal PDFs, customer emails) needs a snapshot
fallback.

---

## When this contract applies

| Surface | In scope? | Notes |
|---------|-----------|-------|
| Surveys created via SolarPro SSO handoff | **Yes** | The standard path; the contract is mandatory. |
| Surveys created via legacy local email/password signin | **No** (legacy) | Pre-May 2026 path. `solarpro_user_id` may be null. Don't backfill; treat as historical. |
| `users` table on the app's Render Postgres | **No** (vestigial) | Table is being dropped in F-18 Step 7. All reads route through `WEBSITE_DATABASE_URL` to Neon. |
| User records in Neon (`users` table on Vercel) | **Yes — source of truth** | Never write to it from the app side. |
| Refresh tokens (`refresh_tokens` on app Postgres) | **Out of contract scope** | Session bookkeeping, not user records. |
| Auth tokens in mobile `AsyncStorage` (`AUTH_TOKEN_KEY`, `REFRESH_TOKEN_KEY`) | **Out of contract scope** | Mobile session only; not duplicated. |

---

## Cross-references

- **F-18 spec** (the work this contract supports):
  `C:\Users\carpe\.minimax-agent\projects\Solarpro\F18-SPEC.md`
- **AI-AGENT-README.md §13** (canonical contract at the system level):
  `C:\Users\carpe\.minimax-agent\projects\Solarpro\AI-AGENT-README.md`
- **SolarPro-only auth handoff** (May 2026 — the auth flow that
  establishes the `solarpro_user_id` claim):
  `docs/HANDOFF_SOLARPRO_ONLY_AUTH.md`
- **SSO contract** (handoff JWT claims, including `solarpro_user_id`):
  `docs/SITE_SURVEY_SSO_CONTRACT.md`
- **Auth implementation** (reads Neon, signs app JWTs):
  `backend/src/services/sqliteAuthStore.ts`
- **SSO handler** (provisions the link from Neon claim to app user):
  `backend/src/routes/users.ts:730` (POST /api/users/solarpro-sso)

---

## Future-agent checklist

Before touching ANY of the following, read this contract first:

- [ ] The mobile `surveys` SQLite schema (`mobile/src/database/schema.ts`)
- [ ] The app's Render Postgres `surveys` schema (`database/schema.sql`)
- [ ] The webhook service that ships `solarpro_*` fields to the
      website (`backend/src/services/webhookService.ts`)
- [ ] The website's ingest pipeline
      (`Solarpro/lib/survey/ingest/*`)
- [ ] Any new env var related to user identity

If you're adding a new `solarpro_*` column, **stop** and surface
to JAMES — the contract says no more denormalized columns.

If you're changing how `inspector_name` is computed, **stop** and
verify the `users_cache` mobile table (F-18 Step 2) is the new
source, not a free-text field.

---

## Changelog

- **1.0 (2026-06-23, F-18 Step 1)** — initial contract. Additive docs
  only. No code change. The deprecated column status reflects the
  in-flight F-18 work; this doc will be updated as Steps 2–7 land.

— blake
