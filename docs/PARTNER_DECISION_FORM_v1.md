# SolarPro ⇄ Site Survey — Finalized Integration Choices (v1)

These choices are now fixed for implementation.

---

## 1) Full Survey Pull Auth

**Selected:** Bearer token (JWT)

Endpoint used by ingest pipeline:
- `GET /api/surveys/{id}`
- Header: `Authorization: Bearer <token>`

Rationale:
- simplest operationally
- already aligned with existing backend auth
- no extra JWT minting/verification layer required

---

## 2) Photo Delivery Format

**Selected:** `/uploads/...` URL references (Bearer-protected access)

Behavior:
- webhook remains thin event
- full survey payload contains photo references
- consumer fetches data and follows photo references using bearer auth

Rationale:
- avoids payload bloat and base64 transfer overhead
- avoids presign URL lifecycle complexity in current phase
- aligns with current backend media behavior

---

## 3) Handoff Launch URL Shape

**Selected:** `/new-survey?token=...`

Current compatibility:
- mobile now supports `token` as primary
- legacy `t` query key remains accepted as fallback

Rationale:
- explicit and readable query key
- matches partner-side handoff expectation

---

## 4) Secrets (Required Out-of-Band)

- `SURVEY_WEBHOOK_SECRET`
- `SOLARPRO_HANDOFF_SECRET`

Exchange through vault/1Password only.

---

## 5) Staging Test Endpoint

- `POST https://solar-pro.app/api/webhooks/survey-complete`

Expected responses:
- valid signed event: `202` (`ACCEPTED_PRE_INGEST`)
- duplicate event_id: `200` (`duplicate: true`)

---

## 6) Implementation Directive

Proceed with ingest pipeline against these fixed decisions.
No further decision gating required for v47.435 kickoff.
