# Site Survey SSO Contract - Authoritative Specification

**Date**: May 17, 2026  
**Status**: ✅ Live and tested  
**Owner**: Team C (Render backend)

---

## Overview

This document defines the complete SSO handoff between:
- **SolarPro** (authorization, JWT signing)
- **Site Survey App** (mobile app, token exchange)
- **Site Survey Backend** (Render, webhook recipient)

---

## 1. Authorization Flow (SolarPro → App)

### SolarPro Authorization Endpoint

```
GET https://solarpro.solutions/api/auth/authorize
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `redirect_uri` | string | Yes | Where to send browser after auth. Must start with allowed prefix. |
| `state` | string | Yes | CSRF nonce (app-generated, passed through unchanged) |

**Allowed Redirect Prefixes:**
```
sitesurvey://         # Production custom scheme
exp://                # Expo Go development client
com.underthesun.      # Production bundle ID scheme (if configured)
```

**Response:**
- **If user logged in**: `302 redirect` to `{redirect_uri}?token={JWT}&state={state}`
- **If not logged in**: `302 redirect` to `/auth-prompt` (user logs in, returns to authorize URL, then gets redirected)

---

## 2. JWT Specification

### JWT Header
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

### JWT Payload
```json
{
  "sub": "<user-uuid>",
  "solarpro_user_id": "<user-uuid>",
  "email": "user@example.com",
  "name": "Jane Doe",
  "iat": 1700000000,
  "exp": 1700000600,
  "jti": "<uuid-v4>"
}
```

### Signing
- **Algorithm**: HS256
- **Secret**: `SOLARPRO_HANDOFF_SECRET` (shared between SolarPro and Site Survey backends)
- **TTL**: 10 minutes
- **Single-use**: Yes (verified by jti tracking)

---

## 3. Token Exchange (App → Site Survey Backend)

### Endpoint

```
POST /api/users/solarpro-sso
Host: site-survey-api-bpyz.onrender.com
Content-Type: application/json

{
  "token": "<JWT from SolarPro>"
}
```

### Response (200 OK)
```json
{
  "token": "<access-token>",
  "refreshToken": "<refresh-token>",
  "user": {
    "id": "<user-uuid>",
    "email": "user@example.com",
    "fullName": "Jane Doe",
    "role": "user",
    "createdAt": "2026-05-17T20:00:00Z"
  }
}
```

### Error Responses
| Status | Code | Reason |
|--------|------|--------|
| 400 | `token_required` | Missing token in body |
| 401 | `invalid_token` | JWT signature invalid or expired |
| 409 | `token_replayed` | Token was already used (replay attack) |
| 422 | `validation_failed` | Missing required JWT claim (jti, project_id, etc.) |
| 500 | `sso_failed` | Server error during processing |

---

## 4. Webhook Contract (App → SolarPro)

### Endpoint

```
POST {SOLARPRO_WEBHOOK_URL}
Host: solarpro.solutions
Content-Type: application/json
X-Survey-Signature: sha256={hex-digest}
X-Survey-Timestamp: {ISO8601-timestamp}
X-Survey-Event-Id: {event-uuid}
```

### HMAC Signature Calculation

```typescript
digest = HMAC-SHA256(
  message: `${X-Survey-Timestamp}.${raw-json-body}`,
  secret: SURVEY_WEBHOOK_SECRET
)
```

**Important**: The raw JSON body **must** be the exact bytes sent over the wire, not re-serialized.

### Signature Header Format
```
X-Survey-Signature: sha256=<64-char-hex>
// or just the hex without sha256= prefix (both accepted)
```

### Timestamp Validation
- Format: ISO8601 (e.g., `2026-05-17T20:54:34.651Z`)
- Replay window: ±5 minutes
- Required to prevent replay attacks

### Payload Example

```json
{
  "event": "survey.completed",
  "event_id": "<uuid-v4>",
  "occurred_at": "2026-05-17T20:54:00Z",
  "survey_id": "<uuid>",
  "status": "completed",
  "completed_at": "2026-05-17T20:53:00Z",
  "solarpro_user_id": "<user-uuid>",
  "solarpro_project_id": "<project-uuid>",
  "solarpro_email": "user@example.com",
  "inspector_name": "Jane Doe",
  "inspector_email": "jane@company.com",
  "solarpro_selected_project_id": "<project-uuid>",
  "solarpro_selected_client_id": "<client-uuid>",
  "project_name": "Downtown Mall",
  "site_name": "Roof A"
}
```

---

## 5. Environment Configuration

### SolarPro Backend (.env)
```
SOLARPRO_HANDOFF_SECRET=prod_handoff_secret_2026_rotate_me
AUTHORIZE_ALLOWED_REDIRECTS=sitesurvey://,exp://,com.underthesun.
# Leave blank to use defaults
```

### Site Survey Backend (Render Dashboard)
```
SOLARPRO_HANDOFF_SECRET=prod_handoff_secret_2026_rotate_me
SURVEY_WEBHOOK_SECRET=prod_handoff_secret_2026_rotate_me
SOLARPRO_WEBHOOK_URL=https://solarpro.solutions/api/webhooks/survey-complete
```

### Mobile App (app.json / EAS)
```
{
  "expo": {
    "extra": {
      "apiUrl": "https://site-survey-api-bpyz.onrender.com"
    },
    "plugins": [
      [
        "expo-app-usb-service",
        {
          "scheme": "sitesurvey"
        }
      ]
    ]
  }
}
```

---

## 6. Security Checklist

- ✅ JWT signed with HS256
- ✅ Shared secret (`SOLARPRO_HANDOFF_SECRET`) matches on both sides
- ✅ Replay attack prevention via jti tracking
- ✅ Webhook HMAC signatures verified
- ✅ Timestamp replay window enforced (±5 minutes)
- ✅ Timing-safe signature comparison
- ✅ CSRF state validation (app responsibility)
- ✅ Single-use tokens (enforced by database unique constraint)

---

## 7. Known Issues & Fixes

### Issue: AUTHORIZE_ALLOWED_REDIRECTS Empty String Bug
**Status**: ✅ **FIXED** (May 17, 2026)

**What happened**: If `AUTHORIZE_ALLOWED_REDIRECTS` env var was set to empty string on Vercel, the allowlist became empty, blocking all redirects including `sitesurvey://`.

**Fix**: Updated `getAllowedRedirectPrefixes()` in SolarPro to return defaults if env var is empty/unset.

**Default allowlist** (no Vercel config needed):
```
sitesurvey://         # production
exp://                # Expo Go
com.underthesun.      # production bundle ID
```

**Result**: ✅ Expo Go development now works without configuration changes.

---

## 8. Testing Checklist

- [ ] Open mobile app, tap "Open SolarPro"
- [ ] Redirects to SolarPro login
- [ ] User logs in successfully
- [ ] Browser redirects back with JWT
- [ ] Mobile app receives token and exchanges it
- [ ] Mobile app shows authenticated home screen
- [ ] Survey submission triggers webhook
- [ ] SolarPro receives webhook with correct signature
- [ ] Survey appears in SolarPro project

---

## 9. Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-17 | 1.0 | Initial handoff from Raymond. Fixed AUTHORIZE_ALLOWED_REDIRECTS empty-string bug. |

---

## Contacts

- **SolarPro Backend**: Raymond
- **Site Survey App**: Kendra
- **Site Survey Backend**: James (Render/Copilot)

**Last Updated**: 2026-05-17 by James (Render backend)

