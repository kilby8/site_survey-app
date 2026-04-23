# Survey Webhook Implementer Guide v1.0

This guide is the implementation contract for partner teams integrating with the Site Survey webhook.

## 1) Endpoint

**Method:** `POST`  
**Path:** `/api/webhooks/survey-complete`

No additional webhook endpoints are required for v1.0.

---

## 2) Event Body (Frozen Thin Event)

The webhook body is a thin event with 6 fields.

```json
{
  "event": "survey.completed",
  "event_id": "uuid",
  "occurred_at": "ISO-8601 timestamp",
  "survey_id": "uuid",
  "status": "submitted",
  "completed_at": "ISO-8601 timestamp"
}
```

### Required fields (5)

- `event` (must equal `survey.completed`)
- `event_id`
- `occurred_at`
- `survey_id`
- `completed_at`

### Optional field (1)

- `status`

---

## 3) Signature & Headers

### Headers

- `X-Survey-Signature`
- `X-Survey-Timestamp`
- `X-Survey-Event-Id`

### Algorithm (exact)

Compute HMAC SHA-256 over:

```text
${timestamp}.${rawBody}
```

- `timestamp` = exact string from `X-Survey-Timestamp`
- `rawBody` = exact raw request body bytes/string (no JSON reformatting)
- digest format = **lowercase hex**

Header format:

```text
X-Survey-Signature: sha256=<lowercase_hex_digest>
```

---

## 4) TypeScript Signing Function (copy/paste)

```ts
import { createHmac } from "crypto";

export function signSurveyWebhook(params: {
  timestamp: string;
  rawBody: string;
  secret: string;
}): string {
  const digest = createHmac("sha256", params.secret)
    .update(`${params.timestamp}.${params.rawBody}`)
    .digest("hex");

  return `sha256=${digest}`;
}
```

---

## 5) Working cURL + OpenSSL Example

```bash
#!/usr/bin/env bash
set -euo pipefail

WEBHOOK_URL="https://your-dev-host.example.com/api/webhooks/survey-complete"
SECRET="whsec_dev_example"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
EVENT_ID="8d7f7a5d-8a84-4ec2-96a8-f0db57876fe8"

RAW_BODY='{"event":"survey.completed","event_id":"8d7f7a5d-8a84-4ec2-96a8-f0db57876fe8","occurred_at":"2026-04-23T18:25:43.000Z","survey_id":"4f2a587d-4d18-4f8c-8f88-9ed6d26ff7c0","status":"submitted","completed_at":"2026-04-23T18:25:41.382Z"}'

SIG_HEX=$(printf "%s.%s" "$TIMESTAMP" "$RAW_BODY" \
  | openssl dgst -sha256 -hmac "$SECRET" -hex \
  | sed 's/^.* //')

SIGNATURE="sha256=$SIG_HEX"

echo "timestamp=$TIMESTAMP"
echo "signature=$SIGNATURE"

curl -i -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Survey-Timestamp: $TIMESTAMP" \
  -H "X-Survey-Event-Id: $EVENT_ID" \
  -H "X-Survey-Signature: $SIGNATURE" \
  --data-raw "$RAW_BODY"
```

---

## 6) Response Semantics + Retry Guidance

### Expected responses

- `200` / `202`: accepted
- `401`: signature/timestamp validation failed (do not treat as transient)
- `400`: invalid payload format/schema (do not treat as transient)
- `501`: accepted but downstream ingest not implemented yet (do **not** retry)
- `5xx`: transient server error (retry)

### Retry policy (sender side)

Recommended backoff sequence:

- 1 min
- 5 min
- 30 min
- 120 min
- 720 min

Stop retrying on non-retriable responses (`400/401/501`).

---

## 7) Secrets, Exchange, and Rotation

### Sender env vars

- `SOLARPRO_WEBHOOK_URL` (receiver base URL)
- `SURVEY_WEBHOOK_SECRET` (shared HMAC secret)

### Receiver env vars

- `SURVEY_WEBHOOK_SECRET` (same shared secret)

### Rotation protocol

- rotate quarterly minimum
- overlap window allowed (old+new accepted for short interval)
- cut old secret after confirmation

---

## 8) v47.435 Preview (Open Decision: GET auth)

For thin event ingestion, receiver fetches full survey via API.

Open auth choice:

1. **Bearer token** (recommended, simpler)  
   Static API credential issued by survey backend (rotate quarterly)

2. **Service JWT** (stronger, more moving parts)  
   Per-request JWT signed/validated by shared trust config

---

## 9) PR Review Questions for Partner Team

1. Confirm thin vs fat event preference (current contract = thin)
2. Confirm photo delivery expectations (URL/reference vs embedded)
3. Confirm GET auth method for v47.435 (Bearer vs Service JWT)
4. Confirm multi-user/account model expectations on receiving side

---

## 10) Why `501` is intentional

`501` indicates:

- webhook delivery contract is valid
- signature validation path is working
- sender should not retry this event

This allows outbound integration to be tested independently while ingest internals are staged.
