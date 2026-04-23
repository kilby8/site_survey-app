# Partner Handoff Message (Ready to Send)

Subject: SolarPro ⇄ Site Survey Staging Integration — Next Actions

Team,

Please use the attached contract docs to begin implementation and staging validation:

1. `docs/SURVEY_WEBHOOK_IMPLEMENTER_GUIDE_v1.md`
2. `docs/INTEGRATION_STAGING_REPORT_exec_summary.html`

## What we need from your side now

1) Confirm auth for `GET /api/surveys/{id}`
- Option A (recommended): Bearer token
- Option B: Service JWT

2) Confirm photo access format in full survey payload
- Signed URL vs bearer-protected URL

3) Confirm handoff launch URL format
- `/launch?token=...` or `/new-survey?token=...` or custom

4) Confirm temporary 501 handling choice for staging
- A) Delay webhook enablement until ingest is live
- B) Return 202 temporarily during pre-ingest window
- C) Add partner retry exemption for 501

## Current integration contract highlights

- Webhook endpoint: `POST /api/webhooks/survey-complete`
- Signature: `HMAC-SHA256(${timestamp}.${rawBody})`
- Headers: `X-Survey-Signature`, `X-Survey-Timestamp`, `X-Survey-Event-Id`
- Body model: thin event

## Test now

Run the provided curl+openssl sample from:
- `docs/SURVEY_WEBHOOK_IMPLEMENTER_GUIDE_v1.md`

Once your endpoint is reachable from staging and secrets are exchanged, we can run end-to-end validation.
