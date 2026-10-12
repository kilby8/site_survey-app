# Install & Final photos — design

Brings install-day and final/pre-inspection photo documentation in-house
(replacing CompanyCam for that job), for the whole crew, flowing into SolarPro
and a one-tap PDF report.

## Control

CompanyCam as Under The Sun uses it today — three reports for the Andrew Lindsey
job (Aug 3 survey → Sep 4/11 racking & electronics → Sep 21 pre-inspection
final; 108 photos; 3 crew: James, Cody, Raymond). Observed:

- One flat "Section 1"; captions typed by hand and inconsistent
  ("Aerial roof", "Ariel roof", "Aeriel roof"; one caption is literally the
  creator line). Many photos have no caption at all (Install Day report).
- No notion of what is *required* for inspection; completeness depends on
  memory (sticker map, cantilevers, CTs, placards, commissioning screenshots).
- Report = cover (company logo, hero photo, count) + 3 photos/page with
  caption, date, creator. No GPS, no section structure, no completeness.
- Strengths: whole crew adds to one project from their own phones, live;
  attribution per photo; timeline; before/after; comments; share links.

## Rating criteria (1–10, both)

1. Shot guidance & completeness for inspection/PTO
2. Organization & captions (sections, consistent names)
3. Crew collaboration (multi-phone, attribution, see each other's shots)
4. Report quality (cover, sections, metadata, completeness, readability)
5. Photo quality control
6. Reliability (offline, retries, no lost/duplicate photos)
7. Hand-off (to SolarPro / office)
8. Field speed
9. Flexibility (ad-hoc photos, notes, screenshots, edits)

## How we beat it

- **Checklists built from the real reports**: every shot in the Lindsey job
  becomes a named slot in a section (Roof attachments, Inverters, Attic run,
  Electrical, Labels, Array final, Commissioning, Site) — guided camera,
  framing hint, required flag. Captions are the slot names; the free note adds
  detail ("Cantilever 9\""). Typos gone; nothing forgotten.
- **Readiness gate** per phase: "Finish install day" / "Finish final" lists
  anything missing (skip with reason, as in surveys).
- **Whole crew, live**: one shared job per SolarPro project. Every phone
  computes the same job id (UUIDv5 of the project id) so crews can start
  offline without creating duplicates. Photos upload as soon as they're taken
  (not on submit) and each phone shows the crew's photos in the same tiles,
  with who took them.
- **Report**: cover (job, address, dates, crew, photo count, hero), a
  checklist page (✓ / skipped-with-reason / missing), then photos by section,
  2 per row, each with caption, note, time, creator, GPS. Same layout every job.
- Existing strengths carry over: blur/dark/duplicate checks, markup, offline
  SQLite, idempotent uploads, SolarPro hand-off.

## Data model

Server (`surveys` table): new `kind TEXT DEFAULT 'survey'` ('survey'|'install').
Install job row id = UUIDv5(namespace, "install:" + solarpro_project_id).

- `PUT  /api/surveys/install-jobs/:id` — create-if-missing (project fields);
  never overwrites another crew member's data. Returns job + answers.
- `PATCH /api/surveys/install-jobs/:id/answers` — merge field answers
  (jsonb `||`), so two phones editing different fields don't clobber.
- `POST /api/surveys/:id/photos` (existing, idempotent by client id) — meta
  carries `creatorName`, `creatorEmail`, `slotId`, `sectionId`, `phase`.
- `DELETE /api/surveys/:id/photos/by-client/:clientPhotoId` — remove a photo.
- `GET  /api/surveys/:id` (existing) — the crew feed (photos + meta + remote_url).
- `POST /api/surveys/install-jobs/:id/finish` `{phase}` — enqueue
  `install.completed` webhook (phase in payload).

Phone: an install job is a local survey row with `doc.kind = "install"` and the
install blueprint; photos live in `survey_photos` as today. A background
uploader sends install photos continuously (signed in + online), independent
of submit. The editor merges server photos from other crew into the slots.

## SolarPro

New event `install.completed` (validator + route). Ingest: resolve the project
the same way as surveys, create/refresh a `site_surveys` row keyed
`<survey_id>:install` with `survey_data.kind = "install"`, insert photos as
`site_survey_files` labelled by slot key. It does **not** touch the project's
survey link, physical data or project_files — the design survey stays the
engineering source of truth. Needs Ray to promote.

## Files

- Backend: `routes/surveys.ts` (kind column, install-jobs routes, delete),
  `services/webhookService.ts` (event type), tests in `__tests__/api.test.ts`.
- Mobile: `survey/installBlueprint.ts` (new), `blueprint.ts` (stepsFor/findSlot),
  `model.ts` (kind), `progress.ts`/`payload.ts`/`CaptureScreen`/`StepTabs`
  (stepsFor), `installSync.ts` (new uploader + feed), `installReport.ts` (new
  PDF), `ui/StartSurveyScreen` + `HomeScreen` (start/join install job), types.
- SolarPro: `lib/survey/types.ts`, `envelopeValidator.ts`, webhook route,
  `lib/survey/ingest/installIngest.ts` (new) + test.

## Out of scope (follow-ups)

Before/after overlay camera, photo comments/threads, public share links,
video clips, Enphase API pull of commissioning data.
