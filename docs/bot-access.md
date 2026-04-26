# Superninja Bot Access Setup

This document defines the recommended, least-privilege way to grant `superninja-bot` access to this stack:

- GitHub repository access (`site_survey-app`)
- Render deploy access
- Expo update/build access

---

## 1) GitHub Access (Code)

Use a dedicated bot account (never a personal account):

- Bot username: `superninja-bot`
- Add as collaborator (or add to a team with scoped repo access)

### Recommended token type

Create a **Fine-grained Personal Access Token** on the bot account:

- Repository access: only this repo (`kilby8/site_survey-app`)
- Permissions:
  - `Contents: Read` (minimum)
  - `Contents: Read and write` (only if bot commits/pushes)
  - `Pull requests: Read and write` (if bot opens/updates PRs)
  - `Metadata: Read`

### Suggested secret name

- `GITHUB_TOKEN_SUPERNINJA`

### Example clone (HTTPS)

```bash
git clone https://<TOKEN>@github.com/kilby8/site_survey-app.git
```

> Do not hardcode tokens in source code, scripts, or commit history.

---

## 2) Render Access (Backend Deploy)

Choose one access mode:

### A) Deploy hook only (safer, deploy-only)

- Create/rotate Render Deploy Hook for `site-survey-api`
- Store as secret:
  - `RENDER_DEPLOY_HOOK_URL`

Example trigger:

```bash
curl -X POST "$RENDER_DEPLOY_HOOK_URL"
```

### B) Render API key (broader control)

- Create Render API key for bot/team account
- Store as secret:
  - `RENDER_API_KEY`

Use only if bot must manage service settings, env vars, or inspect deployments beyond hook trigger.

---

## 3) Expo Access (OTA / Build)

Create Expo token for the bot account/project scope.

### Suggested secret name

- `EXPO_TOKEN`

### Example usage

```bash
export EXPO_TOKEN="$EXPO_TOKEN"
cd mobile
npx eas-cli update --branch main --environment production --message "Automated update"
```

---

## 4) CI/CD Secret Inventory

Recommended secret names:

- `GITHUB_TOKEN_SUPERNINJA`
- `RENDER_DEPLOY_HOOK_URL` (preferred) or `RENDER_API_KEY`
- `EXPO_TOKEN`

Optional:

- `EXPO_PROJECT_ID`
- `RENDER_SERVICE_ID`

---

## 5) Security Controls (Required)

- Enable branch protection on `main`
- Require pull requests for non-emergency changes
- Restrict who can bypass protections
- Rotate all bot tokens regularly
- Set token expiry where supported
- Revoke tokens immediately if exposure is suspected
- Use environment-level secret scopes in CI

---

## 6) Operational Policy for This Repo

When automation receives a “push update” instruction:

1. Push Git changes to `main` (or open PR if protections require it)
2. Publish Expo OTA update (production branch)
3. Trigger Render deploy **when backend files changed**
4. Verify:
   - `GET /api/health` is `200`
   - key target route checks for the deployed feature

---

## 7) Troubleshooting

### Bot can read but cannot push

- Check token permission includes `Contents: Read and write`
- Check branch protection rules and required checks

### Render deploy hook triggers but app not updated

- Verify service branch is `main`
- Verify service root directory is `backend`
- Check latest deploy commit SHA in Render logs

### Expo update fails

- Ensure command is run from `mobile/`
- Ensure `EXPO_TOKEN` is present and valid
- Ensure EAS project is linked correctly

---

## 8) Rotation Checklist

On every credential rotation:

1. Create new token/key/hook
2. Update CI secrets
3. Run a smoke deploy/update test
4. Revoke old token/key/hook
5. Record rotation date in your internal ops log
