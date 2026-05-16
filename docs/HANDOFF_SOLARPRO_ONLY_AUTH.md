# SolarPro-Only Authentication Handoff

**Date:** May 16, 2026  
**Status:** ✅ Complete & Type-Safe  
**Scope:** Mobile app local login removal + SolarPro handoff hardening

---

## Summary

The Site Survey app **no longer accepts local email/password credentials**. All authentication now flows through SolarPro via a cryptographically-secured deep-link handoff:

1. User taps "Open SolarPro" in the app
2. Browser opens SolarPro login URL with a one-time `state` nonce
3. User authenticates on SolarPro website
4. SolarPro redirects back to app via `sitesurvey://login?token=JWT&state=nonce`
5. App validates the state, exchanges token via `/api/users/solarpro-sso`, and establishes session
6. All requests use the app session token (no double-auth needed)

---

## What Changed

### Mobile App (`mobile/`)

#### Removed Local Auth Surfaces
- ❌ `LoginScreen.tsx` → **now SolarPro-only** (no email/password fields)
- ❌ `RegisterScreen.tsx` → `<Redirect href="/login" />`
- ❌ `ForgotPasswordScreen.tsx` → `<Redirect href="/login" />`
- ❌ `AuthContext.tsx` → removed `signInWithPassword`, `registerWithPassword`, `requestPasswordReset`, `completePasswordReset`

#### New SolarPro Flow
- ✅ `LoginScreen.tsx` → accepts `?token=...&state=...` from deep link
- ✅ `AuthContext.tsx` → added `signInWithSolarProToken(token)` method
- ✅ `client.ts` → added `exchangeSolarProSso(token)` API helper
- ✅ `app.json` + `app.config.js` → added `"scheme": "sitesurvey"` for deep-link registration
- ✅ `app/_layout.tsx` → only `/login` is counted as an unauthenticated route now

#### Session Persistence
Same as before — `AsyncStorage` stores access + refresh tokens, with proactive refresh 2 minutes before expiry.

### Backend API (`backend/src/routes/users.ts`)

#### SolarPro SSO Endpoint Hardened
- ✅ `POST /api/users/solarpro-sso` now **requires `jti` claim** in the JWT
- ✅ Added **one-time-use replay protection**:
  - New table: `used_solarpro_sso_tokens (jti TEXT PRIMARY KEY)`
  - On first use, `jti` is inserted
  - On replay, a `409 Conflict` is returned
- ✅ Auto-provisions user if not found (same as before)
- ✅ Audit logging for created/matched/success/error events

#### Test Coverage
- ✅ Happy path: SSO token creates session on first use
- ✅ Replay rejection: same `jti` returns `409` on second use
- ✅ Validation: token missing `jti` returns `422`

### Config & Infrastructure
- ✅ App scheme `sitesurvey://login` registered in Expo config
- ✅ No new environment variables required
- ✅ Existing `SOLARPRO_HANDOFF_SECRET` still used for JWT verification

---

## Flow Diagram

```
┌─────────────────────┐
│  Site Survey App    │
│                     │
│  "Open SolarPro"    │
│  Button             │
└──────────┬──────────┘
           │
           ├─ Generate random state nonce
           ├─ Store state in AsyncStorage
           │
           └─→ Linking.openURL(
                https://solarpro.solutions/api/auth/authorize
                ?redirect_uri=sitesurvey://login
                &state=<nonce>
              )
               │
               └─→ ┌─────────────────────────┐
                   │  SolarPro Website       │
                   │  (in browser)           │
                   │                         │
                   │  User logs in (or is    │
                   │  already logged in)     │
                   └─────────────┬───────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    └─→ Browser receives      │
                        redirect:             │
                        sitesurvey://login    │
                        ?token=<JWT>          │
                        &state=<nonce>        │
                        │
                        └─→ Deep link handled by Expo Router
                            ↓
                    App receives params
                    ├─ Validate state matches stored
                    ├─ Exchange token:
                    │  POST /api/users/solarpro-sso
                    │  { token: "<JWT>" }
                    │  ↓
                    │  Returns:
                    │  {
                    │    token: "<access>",
                    │    refreshToken: "<refresh>",
                    │    user: { ... }
                    │  }
                    │
                    ├─ Store tokens in AsyncStorage
                    ├─ Schedule token refresh in 2 min
                    └─→ Router.replace('/')
                        (Home screen authenticated)
```

---

## Testing Checklist

### Manual Testing
- [ ] **Happy Path:** Fresh app install → tap "Open SolarPro" → login/auth on website → return to app → authenticated
- [ ] **State Mismatch:** Manually tamper with the `state` param in the deep link → expect error message + clean retry
- [ ] **Token Expiry:** Let access token expire → backend rejects with 401 → client attempts refresh → continues or re-prompts SolarPro
- [ ] **Replay Protection:** Attempt to use the same token twice → second use returns 409

### Backend Regression (Blocked)
Database tests in `backend/src/__tests__/api.test.ts` added for SSO flow:
- ✅ Type-checks pass (`npm run build`)
- ⏳ Runtime tests require live Postgres (not available in this environment)
- **Run on deployment:** `npm test -- --runInBand src/__tests__/api.test.ts`

### Mobile TypeScript
- ✅ `npm run typecheck` passes
- ✅ No unused imports or dead code paths
- ✅ All local auth references removed

### Backend TypeScript
- ✅ `npm run build` produces valid dist/ output
- ✅ SSO replay protection table init guaranteed on first request

---

## Deployment Readiness

### Pre-Push Checklist
- [ ] Backend built and committed (`npm run build` output in dist/)
- [ ] Mobile typecheck green (`npm run typecheck`)
- [ ] Backend tests pass in CI/CD pipeline (`npm test -- --runInBand`)
- [ ] Render backend updated with new `used_solarpro_sso_tokens` table setup code
- [ ] Expo update published for mobile changes

### Environment Variables (No New Ones Needed)
- `SOLARPRO_HANDOFF_SECRET` ← existing, still required
- Everything else from before still applies

### Versioning
- **Mobile**: Increment version code (current: 22) → test with EAS build
- **Backend**: No schema migration needed (self-healing table init on first SSO request)

---

## Rollout Plan

### Phase 1: Backend Deploy (Safe)
1. Push backend changes to repo
2. Render auto-deploys (`backend/src/routes/users.ts` + test changes)
3. First SolarPro SSO request creates `used_solarpro_sso_tokens` table

### Phase 2: Mobile Deploy (User-Facing)
1. Publish Expo update with new LoginScreen + deep-link config
2. Existing app sessions remain valid (no forced logout)
3. New users (or those clearing app data) hit SolarPro flow only
4. Monitor for deep-link callback issues (look for state validation errors in logs)

### Rollback Plan
If SolarPro handoff fails:
1. Revert backend to previous commit (local auth routes remain functional)
2. Revert mobile to previous Expo update
3. Users can immediately fall back to local login

---

## Known Limitations & Notes

### ⚠️ State Validation
- The app generates a cryptographic state nonce and stores it in `AsyncStorage`
- If user closes the browser and the app before the callback is processed, the state is retained but a new nonce is generated on the next "Open SolarPro" attempt
- This is **correct behavior** — old state is discarded on retry

### ⚠️ Callback URL Format
- Expo's `createURL('/login')` is used to generate the deep link
- In development, this may resolve to `exp://...` (Expo Go)
- In production (EAS build), this resolves to `sitesurvey://...`
- **SolarPro must be configured to accept both during testing**

### ⚠️ Refresh Token Handling
- Refresh tokens are issued on every SSO exchange
- The app schedules proactive refresh 2 minutes before expiry
- If user closes the app right before expiry, the next API call will fail with 401, triggering a refresh retry
- If refresh fails, user is logged out and must re-authenticate via SolarPro

---

## Files Changed

### Mobile
```
mobile/app/
  ├─ _layout.tsx                           (+1 auth route removed)
  ├─ register.tsx                          (→ Redirect to /login)
  ├─ forgot-password.tsx                   (→ Redirect to /login)
  └─ app.json, app.config.js               (+ scheme: sitesurvey)

mobile/src/
  ├─ screens/
  │   ├─ LoginScreen.tsx                   (✨ SolarPro-only)
  │   ├─ RegisterScreen.tsx                (→ Redirect)
  │   └─ ForgotPasswordScreen.tsx          (→ Redirect)
  ├─ context/
  │   └─ AuthContext.tsx                   (+ signInWithSolarProToken, - 4 local methods)
  └─ api/
      └─ client.ts                         (+ exchangeSolarProSso)
```

### Backend
```
backend/src/
  ├─ routes/users.ts                       (+ SSO replay protection, + jti validation)
  ├─ lib/envGuard.ts                       (fixed stray token)
  └─ __tests__/api.test.ts                 (+ SSO test cases)
```

### Docs
```
docs/
  └─ HANDOFF_SOLARPRO_ONLY_AUTH.md         (this file)
```

---

## Next Steps

1. **Immediate:** Push changes and verify backend compiles in CI
2. **Testing:** Run full API test suite on staging with live DB
3. **Mobile:** Build Android/iOS test builds via EAS and verify deep link works
4. **SolarPro Alignment:** Confirm SolarPro `/api/auth/authorize` endpoint returns correct redirect URI during development
5. **Deployment:** Stage on Render + publish mobile update when green

---

## Questions?

Refer to:
- `docs/HANDOFF_B_MOBILE_SSO_INTEGRATION.md` — original SSO design
- `backend/src/routes/users.ts` lines 699–797 — SSO endpoint implementation
- `mobile/src/screens/LoginScreen.tsx` — callback handler logic
- AGENTS.md — system architecture and terminology

