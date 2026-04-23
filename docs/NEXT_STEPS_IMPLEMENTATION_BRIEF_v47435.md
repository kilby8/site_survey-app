# v47.435 Implementation Brief — Fetch + Handoff

Use this as the execution contract for the next implementation pass.

## Fixed decisions

- Partner base domain: `https://survey.partnerapp.com`
- Handoff URL shape: `/new-survey?token=...`
- Full survey auth: Bearer token
- Photo access format: `/uploads/...` URLs with Bearer auth

## Required environment variables

Add to backend runtime:

- `PARTNER_BASE_URL=https://survey.partnerapp.com`
- `PARTNER_API_BEARER_TOKEN=<partner-issued-static-token>`
- `SOLARPRO_HANDOFF_SECRET=<shared-hs256-secret>`
- `HANDOFF_TOKEN_TTL_SECONDS=600` (recommended)

## Handoff token contract (SolarPro-minted JWT)

- Algorithm: `HS256`
- Signed by: `SOLARPRO_HANDOFF_SECRET`
- Required claims:
  - `jti` (unique token id)
  - `project_id`
- Recommended claims:
  - `project_name`
  - `site_name`
  - `site_address`
  - `inspector_name`
  - `category_id`
  - `category_name`
  - `notes`
  - `latitude`
  - `longitude`
  - `gps_accuracy`
  - `metadata`
- Recommended standard fields:
  - `iat`
  - `exp`

Launch URL output:

`https://survey.partnerapp.com/new-survey?token=<jwt>`

## Ingest pipeline implementation checklist

1. On valid `survey.completed` webhook, read `survey_id`.
2. Fetch full survey:
   - `GET ${PARTNER_BASE_URL}/api/surveys/{survey_id}`
   - Header: `Authorization: Bearer ${PARTNER_API_BEARER_TOKEN}`
3. Parse `/uploads/...` photo URLs from payload.
4. Fetch photo assets with same bearer header.
5. Transform to SolarPro internal structures:
   - project
   - layout
   - project_files
6. Persist idempotently keyed by `survey_id` + `event_id`.
7. Log metrics:
   - fetch success/failure
   - transform success/failure
   - persisted records count

## Partner coordination note

Partner should push mobile changes now.

Their handoff parser already accepts:
- `token` (primary)
- `t` (legacy fallback)

## Acceptance criteria

- First real webhook triggers full payload fetch and persistence.
- `/uploads/...` photo retrieval succeeds with bearer token.
- Handoff URL generated as `/new-survey?token=...` and accepted by partner mobile.
- End-to-end run recorded with one successful survey ingest and one successful handoff launch.
