/**
 * envGuard.ts
 *
 * PIPELINE INTEGRITY GUARD — run at server startup.
 *
 * Validates every environment variable that is load-bearing for the
 * survey → SolarPro pipeline. If anything critical is missing or wrong,
 * the server refuses to start with a clear error message.
 *
 * DO NOT remove or bypass these checks. They exist because a misconfigured
 * env var silently breaks the mobile client dropdown or webhook delivery
 * with no obvious error until a field worker tries to submit a survey.
 *
 * To run manually:
 *   npx ts-node src/lib/envGuard.ts
 */

interface EnvVarSpec {
  name: string;
  minLen?: number;
  mustStartWith?: string;
  mustEqual?: string;
  description: string;
  fatal: boolean; // if true, process exits on failure
}

const REQUIRED_VARS: EnvVarSpec[] = [
  // ── Auth ────────────────────────────────────────────────────────────────
  {
    name: "JWT_SECRET",
    minLen: 20,
    description: "Signs Render user JWTs. Do not change.",
    fatal: true,
  },

  // ── Database ────────────────────────────────────────────────────────────
  {
    name: "DATABASE_URL",
    minLen: 20,
    description: "Render PostgreSQL connection string. Do not change.",
    fatal: true,
  },

  // ── SolarPro integration ────────────────────────────────────────────────
  {
    name: "SOLARPRO_API_URL",
    minLen: 10,
    mustStartWith: "https://",
    description: "Base URL of SolarPro (used for mobile proxy calls). Do not change.",
    fatal: true,
  },
  {
    name: "SOLARPRO_WEBHOOK_URL",
    minLen: 10,
    mustStartWith: "https://",
    description: "URL of SolarPro webhook endpoint. Do not change.",
    fatal: true,
  },

  // ── Shared secrets (MUST match Vercel) ──────────────────────────────────
  {
    name: "SOLARPRO_HANDOFF_SECRET",
    minLen: 32,
    description:
      "CRITICAL: Signs mobile proxy JWTs. Must match SOLARPRO_HANDOFF_SECRET in Vercel. " +
      "Changing this breaks the mobile client dropdown immediately.",
    fatal: true,
  },
  {
    name: "SURVEY_WEBHOOK_SECRET",
    minLen: 20,
    description:
      "CRITICAL: HMAC-signs outbound webhooks. Must match SURVEY_WEBHOOK_SECRET in Vercel. " +
      "Changing this causes every webhook to be rejected with 401.",
    fatal: true,
  },
];

export function runEnvGuard(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const spec of REQUIRED_VARS) {
    const val = process.env[spec.name]?.trim();

    if (!val) {
      const msg = `[ENV_GUARD] MISSING: ${spec.name} — ${spec.description}`;
      if (spec.fatal) errors.push(msg);
      else warnings.push(msg);
      continue;
    }

    if (spec.minLen && val.length < spec.minLen) {
      const msg =
        `[ENV_GUARD] TOO SHORT: ${spec.name} is ${val.length} chars, need >= ${spec.minLen} — ` +
        spec.description;
      if (spec.fatal) errors.push(msg);
      else warnings.push(msg);
      continue;
    }

    if (spec.mustStartWith && !val.startsWith(spec.mustStartWith)) {
      const msg =
        `[ENV_GUARD] INVALID FORMAT: ${spec.name} must start with "${spec.mustStartWith}" — ` +
        spec.description;
      if (spec.fatal) errors.push(msg);
      else warnings.push(msg);
      continue;
    }

    if (spec.mustEqual && val !== spec.mustEqual) {
      const msg =
        `[ENV_GUARD] WRONG VALUE: ${spec.name} — ${spec.description}`;
      if (spec.fatal) errors.push(msg);
      else warnings.push(msg);
      continue;
    }

    console.log(`[ENV_GUARD] OK: ${spec.name} (len=${val.length})`);
  }

ge   // Also warn if all upstream service auth keys are absent
  // (these are optional in code but should be set for Path B auth)
  const hasMobileKey =
    process.env.MOBILE_SERVICE_API_KEY?.trim() ||
    process.env.SOLARPRO_API_KEY?.trim() ||
    process.env.PARTNER_API_KEY?.trim();
  if (!hasMobileKey) {
    warnings.push(
      "[ENV_GUARD] WARN: Neither MOBILE_SERVICE_API_KEY, SOLARPRO_API_KEY, nor PARTNER_API_KEY is set. " +
      "Path B service key auth is disabled. Mobile proxy will use SOLARPRO_HANDOFF_SECRET JWT only."
    );
  }

  for (const w of warnings) {
    console.warn(w);
  }

  if (errors.length > 0) {
    console.error("\n[ENV_GUARD] ══════════════════════════════════════════════");
    console.error("[ENV_GUARD] SERVER STARTUP ABORTED — critical env vars missing:");
    for (const e of errors) {
      console.error(`[ENV_GUARD]   ✗ ${e}`);
    }
    console.error("[ENV_GUARD] Fix these in the Render dashboard before restarting.");
    console.error("[ENV_GUARD] ══════════════════════════════════════════════\n");
    process.exit(1);
  }

  console.log("[ENV_GUARD] All critical environment variables verified ✓");
}