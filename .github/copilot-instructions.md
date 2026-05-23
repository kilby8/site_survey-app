# Copilot Instructions

## Project Guidelines
- User prefers autonomous execution: continue through each phase without asking for confirmation, and audit the previous phase for correctness before proceeding.
- User prefers direct execution of requested repo operations instead of receiving command instructions.
- When asked to provide an update message, proceed and confirm without waiting.
- When asked to push updates, perform both Expo update and Render backend deploy when backend changes require it, and verify both.
- If the user says no push, keep changes local and provide a status update without pushing.
- User prefers not to test app changes locally and wants changes pushed for remote testing instead.
- When refining existing code, implement best practices to ensure high-quality code.
- When doing UI overhauls, keep and reuse the existing project branding color schemes while polishing layout.
- This project should be treated as mobile-only; do not provide or prioritize web-only UI work.
- Follow strict terminology: use 'app' for the Site Survey codebase and 'website' for Raymond's SolarPro codebase; treat the website database as the source of truth for credentials and the app database as the target to reconcile.
- After creating a plan, execute it immediately unless the user explicitly stops execution.
- Provide a short visual execution preview/status before and during multi-step actions.
- Never perform manual user password resets unless the user explicitly requests a reset.
- For credential incidents, default to hash-sync-only remediation between website and app databases unless explicitly instructed otherwise.
- Do not rotate exposed keys/secrets unless the user explicitly requests rotation.
- Never add, remove, or modify environment variables (in `.env`, `render.yaml`, Render dashboard, Vercel dashboard, or any config file) without explicit user permission.
- For UI tasks, the target is the public solar-pro.app landing page with the 'Download the App' button, not the authenticated app screen.
- For Android Play Store releases, always target Closed Testing (`alpha` track), ensure `versionCode` is incremented above the current live/active version before submission, and assume Managed Publishing is OFF (send for review immediately; publish automatically after approval).

## Topography Dashboard Guidelines
- Prefer a React Flow node-graph Mission Control layout with a triple-pane UI and a dark Slate theme.
- Include status badges (LIVE/PARTIAL/NOT WIRED) for nodes.
- Implement a Ctrl+F node search highlight feature.
- Provide a right-side node inspector showing HMAC Verification and Field Mapping details.

## Terminology
- Use the term 'app' for this codebase and 'website' for Raymond's codebase when discussing issues.

## Survey Pipeline & CAD-Ready Architecture
- **Core Philosophy**: The app is a structured data capture engine for SolarPro's CAD/Permit/Engineering pipeline. Every photo and data point must be "Pipeline-Ready" to feed into SLD, BOM, and CAD automated workflows.
- **Photo Metadata (The Golden Block)**: All captured photos MUST include the following metadata object:
    - `projectId`, `surveyId`, `stepId`, `sectionId`, `photoSlotId`, `evidenceCategory`.
    - `isRequired` (boolean), `captureOrder` (int), `timestamp` (ISO-8601).
    - `gps` (lat/lng/alt), `heading` (direction/facing degrees).
    - `notes`, `retakeReason` (if replaced), `qualityStatus`.
    - `solarProRequirementId`, `solarProUsageMapping` (e.g., "SLD", "BOM", "Permit Elevation").
- **Sequential Survey Flow Logic**:
    1. **Project Arrival**: Site verification (Address, Access Path, Hazards, Arrival Time).
    2. **Site Walkaround**: Full property elevations (Front/Back/Left/Right) and wide-shots for CAD site context.
    3. **Utility Service**: Meter evidence, service entry, and riser/mast details for interconnection validation.
    4. **Electrical Equipment**: Main panel, bus ratings, OCPD, and circuit directories for SLD/Engineering.
    5. **Roof & Array**: Plane-by-plane analysis (Pitch, Azimuth, Obstructions, Material) for CAD layout precision.
- **Enforcement**:
    - Do not allow a user to skip "Required" photo slots without a validation override.
    - Treat `solarProUsageMapping` as the source-of-truth for where data lands in the final planset.
    - For Roof sections, always associate photos and data with a specific `planeId`.
