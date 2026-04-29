# C Team Handoff: Render API JWT + Webhook Integration

## Goal
Ensure the app backend (Render API) trusts only website-issued JWT identity and forwards survey completion to website webhook with valid HMAC signature.

## Required Inputs
Environment variables:
- `SOLARPRO_HANDOFF_SECRET` (HS256 JWT verification secret)
- `SURVEY_WEBHOOK_SECRET` (HMAC signing secret for webhook)
- `SOLARPRO_WEBHOOK_URL` (recommended: `https://solarpro.solutions/api/webhooks/survey-complete`)

## Contract Requirements

### 1) JWT Verification Middleware
- Require `Authorization: Bearer <jwt>` on authenticated survey endpoints.
- Verify JWT signature with `SOLARPRO_HANDOFF_SECRET` using HS256.
- Enforce standard checks: expiration, malformed token, missing claims.
- Reject unauthorized/invalid tokens with 401.

### 2) Identity Source of Truth
- Extract `solarpro_user_id` from verified JWT claims.
- Ignore any `user_id`/identity values sent from device payload.
- Use JWT-derived user id for ownership and downstream events.

### 3) Survey Complete Webhook Post
On completion, POST to website webhook URL with body:
- `survey_id`
- `survey_url`
- `completed_at`
- `solarpro_user_id`
- `solarpro_project_id` (optional)

Sign raw request body using HMAC-SHA256 with `SURVEY_WEBHOOK_SECRET` and send signature header (`X-Signature`, per current website contract).

## Security Rules
- Fail closed if JWT verification key missing in production.
- Fail closed if webhook secret missing where webhook dispatch is required.
- Never log full bearer tokens or raw secrets.
- Redact sensitive headers/body fields in logs.

## Recommended Middleware Behavior
1. Parse bearer token.
2. Verify HS256 signature + exp.
3. Validate required claim: `solarpro_user_id`.
4. Attach authenticated identity to request context.
5. Continue to handler.

## Acceptance Criteria
- Requests with invalid/missing JWT are rejected.
- Valid JWT requests succeed and use JWT `solarpro_user_id` for ownership.
- Device `user_id` tampering has no effect.
- Completion webhook is accepted by website when HMAC is valid.
- Invalid signature test is rejected by website.

## QA Test Matrix
1. Missing Authorization header -> 401.
2. Bad signature token -> 401.
3. Expired token -> 401.
4. Valid token + device mismatched user_id -> processed under JWT user.
5. Webhook with valid HMAC -> 2xx from website.
6. Webhook with invalid HMAC -> reject response from website.

## Operational Notes
- Keep website as credential/identity source of truth.
- App backend remains transport + enforcement layer for JWT-based identity.
- If retries are needed for webhook delivery, keep idempotency safeguards around `survey_id`.
