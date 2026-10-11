# Site Survey App Overhaul — Design (Gauntlet loop 1)

## Control

**SiteCapture + Scanifly Mobile, combined.** The overhaul must beat the better
of the two on every criterion below and must not be worse on any.

What the control does (public listings, help docs, release notes, Oct 2026):

| Capability | SiteCapture | Scanifly Mobile |
|---|---|---|
| Guided capture | Per-field camera button, **example photo** per field showing target framing | Checklist templates; **required-field count per section** in a progress sheet |
| Photo QC | **Blurry-photo detection**, AI review flags with failure notes, caption-to-override | — |
| Structure | Field groups, auto-added items, **conditional logic** | Structural / electrical / property forms, prefill from design |
| Markup | — | **Stickers, text and drawing on photos** |
| Reliability | (Review: "sync takes ~5 min before photos are viewable") | **Uploads resume after dropped connection, restart or app close**; stuck uploads auto-finish; reset uploading → draft |
| Flow | Status New → In Progress → Review → Complete; can't complete with failures | Submit only when all required fields done; PDF export |
| Finding the job | Project search (review: slow) | **Address-based project search** |

## Rating criteria (scored 1–10, both apps)

1. **Guided capture** — required slots, framing guide, per-section progress
2. **Photo quality control** — blur check, retake with reason, justified override
3. **Design-ready data** — structured fields (incl. plane-by-plane roof), Golden Block per photo, lands in SolarPro
4. **Reliability** — start offline, autosave everything, resume after kill, uploads resume without duplicates
5. **Field speed** — taps per required photo, find/prefill the job, no dead ends
6. **Markup** — annotate a photo without losing the original
7. **Review & submit** — clear gaps, gating, override reasons, status
8. **Field legibility / accessibility** — sun-readable type, 48 pt targets, screen-reader labels

## How we beat the control

- **Every** required slot shows a **framing guide** (SiteCapture's example photo), and every step and
  section shows **required-done/required-total** (Scanifly's counts), in one screen.
- Blur check runs **on the device, offline, at the shutter** — no round trip to an AI review. Blurry →
  "Retake" or "Keep (reason)". The reason travels with the photo.
- Golden Block metadata (step, section, slot, plane, GPS, compass heading, shutter time, required,
  capture order, retake reason, quality, SolarPro requirement + usage mapping) is written **at capture**
  and stored on the server per photo. Neither control exposes this.
- The draft lives in SQLite from the first tap and saves on every change. A killed app resumes on
  the same step. A survey can start **offline** with no project picked (linked later, or owned by email).
- Uploads are **per photo and idempotent** (client photo id + server unique key), resume after
  restart, and auto-retry with backoff — Scanifly's best feature, without its duplicate/stuck bugs.

## Flow (spec order, `.github/copilot-instructions.md`)

`Start → 1 Arrival → 2 Walkaround → 3 Utility → 4 Electrical → 5 Roof & Array → Review → Submit`

- **Start**: search SolarPro projects by name or address (cached for offline), or "Start without a
  project". Install type chosen here (roof / ground / fence / commercial 3-phase), prefilled from project.
- **Steps** are tabs across the top with a ring showing required progress. Inside a step: sections →
  data fields + photo slots. Conditional fields (e.g. *Sub panel present? → Yes* shows sub panel slots;
  *Service: Overhead* shows mast/riser slot).
- **Roof & Array** (roof install): repeatable **planes** (Plane A, B, …) each with pitch, azimuth (°, with
  N/E/S/W quick buttons), material, obstructions and its own photo slots — photos carry `planeId`.
  Ground/fence/commercial get their own section set from the existing metadata variants.
- **Review**: per-step completion, missing required slots, blurry photos; Submit is blocked until each
  gap is filled or overridden **with a reason**. Submit uses `router.replace` (no double submit).

## Architecture

New domain module, screens rebuilt on it. Old wizard files are removed.

```
mobile/src/survey/
  blueprint.ts     steps → sections → fields + slots (ids, required, showIf, guide, usage mapping)
  model.ts         SurveyDoc (answers, planes, overrides), CapturedPhoto (Golden Block)
  progress.ts      visibility, required counts, missing list, readiness
  quality.ts       blur score (Laplacian variance on a 160 px grayscale thumb, jpeg-js)
  repo.ts          SQLite load/save of doc + photos; autosave; resume
  payload.ts       doc → server payload (legacy-compatible metadata + checklist + v2 doc)
mobile/src/ui/      theme tokens + Button, Field, Choice, YesNo, NumberField, Card, Badge,
                    ProgressRing, SlotTile, FramingGuide, ScreenHeader, BottomBar
mobile/src/screens/ StartSurvey, Capture (step tabs), Camera result/QC sheet, PhotoViewer+Markup,
                    Review, Home (In progress / Waiting to upload / Uploaded), SurveyDetail
mobile/src/services/sync/  per-photo uploader, backoff scheduler, warm-up, triggers
```

### Data

- SQLite `surveys` gains `doc TEXT` (SurveyDoc JSON), `current_step TEXT`, `owner_email TEXT`.
- SQLite `survey_photos` gains `slot_id, step_id, section_id, plane_id, required, capture_order,
  gps_lat, gps_lng, gps_alt, heading, notes, retake_reason, quality_status, blur_score,
  annotated_path, client_photo_id, upload_state ('local'|'uploaded'), server_photo_id`.
- File paths stored **relative** to `documentDirectory`; resolved at read time.
- Server `survey_photos` gains `client_photo_id` (unique per survey) and `meta JSONB` (Golden Block).
  Upload with an existing `client_photo_id` returns the existing row (no duplicate).
- Server payload keeps today's fields (so SolarPro's v1 transformer keeps working): `metadata.type`,
  roof `azimuth` (degrees of Plane A), `roof_material`, `rafter_*`; `checklist[]` derived from steps;
  plus `metadata.survey_v2` with the full doc.

### Reliability

- API timeout 45 s (uploads 300 s); `/api/health` warm-up before a sync run.
- Sync triggers: launch, network regained, app foreground, after sign-in, and a backoff timer
  (1, 2, 5, 15, 30 min). `error` surveys are retried automatically; one bad survey never blocks the rest.
- Auth restores **offline** from the cached user; a single shared refresh (no double refresh);
  tokens in SecureStore; state nonce from `expo-crypto`.
- Sign-out with unsynced work warns and keeps that work tied to its owner email.

### Visual system

Keep the brand (navy `#050B1F`, amber `#FFB020`). Type scale 13 / 15 / 17 / 20 / 26, body 17 for
outdoor reading. 48 pt minimum targets. Icons from `@expo/vector-icons` (no emoji). Every control has
an accessibility label. One floating action area: a bottom bar per screen (no overlapping FABs).

### Native modules (needs a new binary)

`react-native-svg` (framing guides, markup), `expo-secure-store`, `expo-crypto`, `expo-haptics`.
`runtimeVersion` → `2.0.0` so the existing 1.0.0 binaries never receive this JS over the air.
`jpeg-js` is pure JS.

## Out of scope (follow-ups)

Office-side live view and comments (website work), drone imagery, PDF export from the app
(SolarPro already builds the planset), iOS release.
