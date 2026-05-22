# Blue-Team Audit Checkpoint (Paused)

Date: 2026-04-29
Status: Paused by user request

## Completed
1. Scoped tracked repository and identified runtime/deployment config surfaces.
2. Scanned repository content for secret/token patterns.
3. Scanned git history for known secret-like indicators.
4. Reviewed runtime config files for plaintext credentials.
5. Ran dependency vulnerability checks.
6. Added containment ignore rules in `.gitignore`:
   - `mobile/credentials.json`
   - `**/__pycache__/`

## Key Findings

### Critical
- `mobile/credentials.json` contains Android signing credential material (`keystorePassword`, `keyAlias`, `keyPassword`).
- Hardcoded Google Maps API key exists in tracked `mobile/app.json` (iOS and Android config entries).

### High
- Git history contains secret-like values in prior commits (JWT secret placeholder, DB password values, Android key-password related introduction).

### Medium
- Backend auth token utility has a development fallback secret if `JWT_SECRET` is unset.
- Dependency audit results:
  - Backend: 4 moderate vulnerabilities.
  - Mobile: 20 vulnerabilities (19 moderate, 1 high via transitive chain).

## Notes
- No secret/key rotation performed (per user instruction).
- Build validation via solution build tool was unavailable in this environment at checkpoint time.

## Resume Next
When resuming, continue with containment-only follow-ups unless rotation is explicitly requested:
1. Move hardcoded Maps key to environment-backed config path.
2. Enforce fail-fast for missing `JWT_SECRET` in production.
3. Prioritize dependency upgrades by exploitability and runtime exposure.
4. Re-run focused scans after changes and update this checkpoint.

---

## Continuation Update (2026-05-22)

Status: In progress (audit resumed)

### Validation Performed
1. Re-scanned repository for hardcoded API key patterns and signing credential indicators.
2. Re-checked backend auth secret handling and startup guard behavior.
3. Re-ran production dependency audits for backend and mobile packages.
4. Checked tracked-file surface and commit history signals for sensitive literals.

### Current Findings (Severity-Ordered)

#### Critical
- Hardcoded Google Maps API key remains in tracked files:
  - `mobile/app.json`
  - `mobile/android/app/src/main/AndroidManifest.xml`

#### High
- Mobile dependency audit now reports 3 high vulnerabilities (increased from prior checkpoint):
  - `axios` (direct dependency in vulnerable range)
  - `@xmldom/xmldom` (transitive)

#### Medium
- Backend token utility still contains a fallback JWT secret literal (`dev_jwt_secret_change_me`) in code:
  - `backend/src/utils/authToken.ts`
  - Runtime startup guard requires `JWT_SECRET` before listening, which reduces production exploitability but does not remove code-level risk for non-standard startup paths (tests/scripts/imported app usage).
- Backend dependency audit now reports 5 findings total (4 moderate, 1 high), including:
  - `fast-xml-builder` (high, transitive)
  - `uuid` (<11.1.1)

### Exposure Notes
- `mobile/credentials.json` is currently ignored and not tracked in HEAD, but prior history exposure risk remains unchanged from earlier checkpoint.
- History scan still shows past commits touching sensitive-like literals in affected files.

### Updated Priority Queue
1. Remove hardcoded Maps API key from tracked config and source from environment/config plugin path.
2. Upgrade mobile `axios` to a patched release and refresh Expo dependency tree where needed.
3. Upgrade backend transitive XML-related packages and `uuid` chain (or bump parent packages that pin them).
4. Replace fallback JWT literal with strict env requirement at token utility level for defense in depth.
5. Re-run scans and record post-remediation deltas in this file.

---

## Remediation Update (2026-05-22)

Status: In progress (containment/remediation applied)

### Implemented Changes
1. Removed hardcoded Google Maps API key from tracked Expo config (`mobile/app.json`).
2. Switched Expo Maps key wiring to environment-backed injection in `mobile/app.config.js` using:
  - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
  - `GOOGLE_MAPS_API_KEY`
3. Replaced hardcoded Android manifest Maps key with placeholder in `mobile/android/app/src/main/AndroidManifest.xml`.
4. Wired Android manifest placeholder from environment in `mobile/android/app/build.gradle`.
5. Removed backend JWT fallback secret literal and enforced strict `JWT_SECRET` presence in `backend/src/utils/authToken.ts`.
6. Upgraded dependencies and refreshed lockfiles:
  - Mobile: `axios` -> `^1.15.2`, `uuid` -> `^11.1.1`
  - Backend: `uuid` -> `^11.1.1` + transitive overrides for XML/parser/MSAL chain

### Post-Remediation Verification
- Secret literal scan (`AIza...`) in `mobile/**`: no matches.
- JWT fallback literal scan (`dev_jwt_secret_change_me`) in `backend/src/**`: no matches.
- Production dependency audits (`--omit=dev`):
  - Backend: 0 vulnerabilities.
  - Mobile: 21 vulnerabilities total (19 moderate, 2 high), improved from 23 (20 moderate, 3 high).

### Residual Risks
- Mobile still has 2 high vulnerabilities via Expo dependency tree; `npm audit` fix path requires Expo major update (`expo@56.x`) and compatibility validation.
- Historical secret exposure risk in git history remains and is unchanged (no rotation performed).

### Next Recommended Action
1. Plan controlled Expo SDK major upgrade in `mobile/` to reduce remaining transitive vulnerabilities.
2. If policy requires historical secret incident closure, perform explicit key rotation workflow (only on request) and document revocation timeline.
