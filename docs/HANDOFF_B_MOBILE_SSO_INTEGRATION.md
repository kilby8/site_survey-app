# B Team Handoff: App (Expo) SSO Integration

## Goal
Enable the app to authenticate users through the website SSO flow and include the website-issued JWT on all app API requests.

## Required Flow
1. App opens website authorize URL.
2. User signs in on website.
3. Website redirects to app deep link with `token` and `state`.
4. App validates `state`, stores token, and uses `Authorization: Bearer <token>` for API calls.

## Endpoints
- Authorize: `https://solarpro.solutions/api/auth/authorize`
- Redirect URI (app): `sitesurvey://login`

Authorize request format:
- `GET /api/auth/authorize?redirect_uri=sitesurvey://login&state=<random>`

Expected behavior:
- If no website session: returns auth required / login challenge.
- If website session exists: redirects to `sitesurvey://login?token=<jwt>&state=<random>`.

## Implementation Checklist

### 1) Deep Link Setup
- Register app scheme `sitesurvey`.
- Ensure route handler exists for `sitesurvey://login`.
- Confirm handler receives query params `token` and `state`.

### 2) State/CSRF Protection
- Generate cryptographically random `state` before opening authorize URL.
- Persist pending state in secure local storage.
- On return, require exact match before accepting token.
- Reject and clear flow if mismatch.

### 3) Token Storage
- Store JWT in secure storage (not AsyncStorage plaintext if avoidable).
- Persist login state from token presence + validity.
- Clear token on logout and auth failures.

### 4) API Client Integration
- Add `Authorization: Bearer <jwt>` to every request to the app backend.
- Do not send user identity fields from device as source of truth.
- Add retry/refresh UX path for expired token (re-run authorize flow).

### 5) Minimal Local Decode (Display Only)
- Optionally decode token for UI display (`email`, `name`).
- Never trust decoded fields for authorization decisions on device.

### 6) Error Handling
- Handle missing token/state in callback.
- Handle user cancel/back in browser flow.
- Handle expired/invalid JWT responses from backend.

## Acceptance Criteria
- User can complete SSO and return to app without manual token entry.
- All survey submissions include bearer JWT.
- Device-supplied `user_id` is not relied on by backend.
- Logout clears token and blocks authenticated requests.

## QA Test Cases
1. Happy path: clean install -> login -> authorize -> callback -> authenticated API call succeeds.
2. State mismatch: tampered callback `state` rejected.
3. Missing token: callback rejected.
4. Expired token: backend rejects, app re-prompts login.
5. Logout: token removed, protected API calls fail until re-login.

## Non-Goals
- No backend identity trust logic in app.
- No credential storage beyond JWT session token.

## Notes
- Website is source of truth for identity.
- App should only transport/attach website-issued JWT.
