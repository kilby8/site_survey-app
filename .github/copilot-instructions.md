# Copilot Instructions

## Project Guidelines
- User prefers autonomous execution: continue through each phase without asking for confirmation, and audit the previous phase for correctness before proceeding.
- User prefers direct execution of requested repo operations instead of receiving command instructions.
- When asked to provide an update message, proceed and confirm without waiting.
- When asked to push updates, perform both Expo update and Render backend deploy when backend changes require it, and verify both.
- When doing UI overhauls, keep the existing project color palette and only improve polish/layout within those colors.
- This project should be treated as mobile-only; do not provide or prioritize web-only UI work.
- Follow strict terminology: use 'app' for the Site Survey codebase and 'website' for Raymond's SolarPro codebase; treat the website database as the source of truth for credentials and the app database as the target to reconcile.
- After creating a plan, execute it immediately unless the user explicitly stops execution.
- Provide a short visual execution preview/status before and during multi-step actions.
- Never perform manual user password resets unless the user explicitly requests a reset.
- For credential incidents, default to hash-sync-only remediation between website and app databases unless explicitly instructed otherwise.

## Terminology
- Use the term 'app' for this codebase and 'website' for Raymond's codebase when discussing issues.