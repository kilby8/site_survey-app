# Stage 9 — v47.434a Action Checklist

Status snapshot: 2026-04-23

## Completed in this stack

- [x] Added inbound webhook receiver endpoint:
  - `POST /api/webhooks/survey-complete`
- [x] Enabled partner wire compatibility:
  - ISO-8601 `X-Survey-Timestamp`
  - `sha256=<hex>` signature prefix
  - raw-body HMAC verification
- [x] Added idempotency handling on `event_id` (`webhook_inbound_events`)
- [x] Added optional pre-ingest mode:
  - env: `WEBHOOK_PRE_INGEST_ACCEPT_202=true`
  - valid signed events return `202` (instead of `501`) during pre-ingest window
- [x] Added OpenAPI route documentation for webhook endpoint
- [x] Added automated API tests for webhook verification and 202 mode
- [x] Deployed and verified live behavior:
  - valid signed event -> `202 ACCEPTED_PRE_INGEST`
  - duplicate `event_id` -> `200 duplicate`

## Operational tasks completed

- [x] Render env configured for staging handshake:
  - `SURVEY_WEBHOOK_SECRET`
  - `WEBHOOK_PRE_INGEST_ACCEPT_202=true`
- [x] Redeploy triggered and validated

## Partner-facing handoff docs completed

- [x] `docs/SURVEY_WEBHOOK_IMPLEMENTER_GUIDE_v1.md`
- [x] `docs/INTEGRATION_STAGING_REPORT_exec_summary.html`
- [x] `docs/PARTNER_HANDOFF_MESSAGE_v1.md`
- [x] `docs/PARTNER_COPY_PASTE_READY.txt`

## External items (cannot be executed from this repo alone)

- [ ] Secret exchange confirmation between orgs (final values in each side's secret manager)
- [ ] Partner-side ingest implementation v47.435 (fetch + transform + persistence)
- [ ] SolarPro-side outbound handoff JWT minter (external codebase)
- [ ] Final production rollout and key rotation protocol sign-off
