# User Credential Reconciliation (website ↔ app)

This script cross-checks and optionally consolidates user credentials between:

- **website backend DB** (source of existing website users)
- **app backend DB** (source used by mobile app sign-in)

## Why
If website and app are connected to different databases, users created on the website may fail to log into the app.

## Script
- Source: `backend/src/scripts/reconcileUsers.ts`
- Built output: `backend/dist/scripts/reconcileUsers.js`

## Required environment variables
Provide both DB URLs when running reconciliation:

- `WEBSITE_DATABASE_URL` (or `SOURCE_DATABASE_URL`)
- `APP_DATABASE_URL` (or `TARGET_DATABASE_URL`)

## What it checks
- users only in website DB
- users only in app DB
- same-email users with password hash mismatch
- same-email users with full name mismatch

## Dry run (no writes)
From repo root:

```bash
npm run build --prefix backend
WEBSITE_DATABASE_URL="..." APP_DATABASE_URL="..." npm run reconcile:users --prefix backend
```

## Apply (write to app DB)
By default with `--apply`, it syncs **missing website users into app DB**.

```bash
npm run build --prefix backend
WEBSITE_DATABASE_URL="..." APP_DATABASE_URL="..." npm run reconcile:users:apply --prefix backend
```

### Optional flags
- `--sync-missing`: insert website-only users into app DB
- `--sync-mismatch`: overwrite app password_hash/full_name with website values for same-email mismatches

Example:

```bash
WEBSITE_DATABASE_URL="..." APP_DATABASE_URL="..." node backend/dist/scripts/reconcileUsers.js --apply --sync-missing --sync-mismatch
```

## Safety notes
- Run dry-run first.
- Treat website DB as source of truth unless you intentionally choose otherwise.
- Passwords are not plaintext; hashes are copied.
- Existing app users are not deleted by this script.
