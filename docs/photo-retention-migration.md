# Photo Retention Migration (Zero-Risk Rollout)

This rollout starts removing app-side photo storage only after SolarPro sync confirmation.

## What was added

- `database/migrations/002_photo_retention_scaffold.sql`
  - Adds `surveys.solarpro_synced_at`
  - Adds `photo_purge_audit`
- `backend/src/services/webhookService.ts`
  - Marks `surveys.solarpro_synced_at` when survey-complete webhook delivery is successful
- `backend/src/scripts/photoRetentionPurge.ts`
  - Stage A: clear `survey_photos.data_url` + `survey_photos.photo_data`
  - Stage B: delete storage file at `survey_photos.file_path` and set `file_path = NULL`
  - Dry-run by default, `--apply` required for mutations

## Safety defaults

- Stage A hold window: 7 days from `solarpro_synced_at`
- Stage B hold window: 30 days from `solarpro_synced_at`
- Audit row is written for every candidate action

## Commands

Run from `backend/` after build.

```powershell
npm run build
npm run photos:purge:dry
npm run photos:purge:apply
npm run photos:purge:stage-b:dry
npm run photos:purge:stage-b:apply
```

Optional tuning:

```powershell
node dist/scripts/photoRetentionPurge.js --limit=500 --hold-days-a=14
node dist/scripts/photoRetentionPurge.js --stage=b --limit=100 --hold-days-b=45
```

## Recommended rollout order

1. Deploy backend with this scaffold.
2. Run Stage A dry-run and inspect audit rows.
3. Run Stage A apply.
4. Wait one release cycle and monitor for missing-photo incidents.
5. Run Stage B dry-run.
6. Run Stage B apply.

## Quick verification SQL

```sql
SELECT COUNT(*) AS synced_surveys
FROM surveys
WHERE solarpro_synced_at IS NOT NULL;

SELECT stage, status, COUNT(*) AS rows
FROM photo_purge_audit
GROUP BY stage, status
ORDER BY stage, status;
```

