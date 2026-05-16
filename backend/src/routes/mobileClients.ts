/**
 * routes/mobileClients.ts
 *
 * PHASE 4.15.4 — USER-SCOPED MOBILE DATA (HARDENED)
 *
 * Client/project lookup endpoints for the mobile app.
 * Proxies to SolarPro's /api/mobile/* with strict user scoping.
 *
 * Auth model:
 *   - Mobile app authenticates with this Render backend via JWT (requireAuth middleware)
 *   - This backend proxies to SolarPro using:
 *       Authorization: Bearer <SOLARPRO_API_KEY>   (service-to-service key)
 *       X-Mobile-User-Email: <req.authUser.email>  (CRITICAL — scopes data to correct user)
 *
 * Without X-Mobile-User-Email, SolarPro falls back to the service account user
 * and returns that user's data instead of the authenticated user's data.
 *
 * Environment variables:
 *   SOLARPRO_API_URL        — base URL of SolarPro backend (required)
 *   MOBILE_SERVICE_API_KEY   — preferred service-to-service bearer token (required)
 *   SOLARPRO_API_KEY / PARTNER_API_KEY — legacy aliases kept for compatibility
 */

import jwt from "jsonwebtoken";
import { Router, type Request, type Response } from "express";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSolarProUrl(): string {
  return (process.env.SOLARPRO_API_URL ?? "").trim().replace(/\/$/, "");
}

function getMobileServiceAuthToken(userEmail: string): string | null {
  const mobileServiceKey = (process.env.MOBILE_SERVICE_API_KEY ?? "").trim();
  const solarProApiKey = (process.env.SOLARPRO_API_KEY ?? "").trim();
  const partnerApiKey = (process.env.PARTNER_API_KEY ?? "").trim();

  const token = mobileServiceKey || solarProApiKey || partnerApiKey || mintServiceJwt(userEmail);
  return token || null;
}

/**
 * Mint a short-lived HS256 JWT for service-to-service auth with SolarPro.
 *
 * Uses SOLARPRO_HANDOFF_SECRET — the same secret already synced between
 * Render and Vercel for handoff tokens. This avoids needing a separate
 * MOBILE_SERVICE_API_KEY env var to be manually synced across dashboards.
 *
 * The JWT carries the mobile user's email so SolarPro can resolve the
 * correct userId via email lookup (Path C + email fallback in auth.ts).
 */
function mintServiceJwt(userEmail: string): string | null {
  const secret = (process.env.SOLARPRO_HANDOFF_SECRET ?? "").trim();
  if (!secret || secret.length < 32) {
    console.error(
      "[MOBILE_PROXY] SOLARPRO_HANDOFF_SECRET is not set or too short — cannot mint service JWT"
    );
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      email: userEmail.trim().toLowerCase(),
      iat: now,
      exp: now + 300, // 5 minutes — enough for the proxy call
    },
    secret,
    { algorithm: "HS256", noTimestamp: true }
  );
}

/**
 * Build proxy headers for SolarPro service-to-service requests.
 * Mints a short-lived JWT signed with SOLARPRO_HANDOFF_SECRET.
 * SolarPro verifies the JWT (Path C) and resolves userId from the email claim.
 */
function buildProxyHeaders(userEmail: string): Record<string, string> | null {
  const token = getMobileServiceAuthToken(userEmail);
  if (!token) return null;
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    // Also send email header as Belt-and-suspenders for Path B fallback.
    "X-Mobile-User-Email": userEmail.trim().toLowerCase(),
  };
}

/**
 * Validates that SOLARPRO_API_URL and at least one upstream auth mechanism
 * are configured (SOLARPRO_API_KEY or SOLARPRO_HANDOFF_SECRET).
 * Returns true if valid, false + sends 503 if not.
 */
function validateConfig(res: Response): boolean {
  const url = getSolarProUrl();
  const mobileServiceKey = (process.env.MOBILE_SERVICE_API_KEY ?? "").trim();
  const apiKey = (process.env.SOLARPRO_API_KEY ?? "").trim();
  const partnerApiKey = (process.env.PARTNER_API_KEY ?? "").trim();
  const secret = (process.env.SOLARPRO_HANDOFF_SECRET ?? "").trim();

  if (!url) {
    res.status(503).json({
      error: "configuration_error",
      message: "SOLARPRO_API_URL is not configured on this server.",
    });
    return false;
  }

  if (!mobileServiceKey && !apiKey && !partnerApiKey && (!secret || secret.length < 32)) {
    res.status(503).json({
      error: "configuration_error",
      message:
        "Configure MOBILE_SERVICE_API_KEY (preferred), SOLARPRO_API_KEY, PARTNER_API_KEY, or SOLARPRO_HANDOFF_SECRET (min 32 chars) for mobile proxy auth.",
    });
    return false;
  }

  return true;
}

/**
 * Proxy a request to SolarPro and forward the response.
 * Passes the authenticated user's email as X-Mobile-User-Email.
 */
async function proxyToSolarPro(
  pathname: string,
  userEmail: string,
  res: Response,
): Promise<void> {
  const solarProUrl = getSolarProUrl();

  const headers = buildProxyHeaders(userEmail);
  if (!headers) {
    res.status(503).json({
      error: "configuration_error",
      message: "No mobile proxy auth secret is set — cannot authenticate with SolarPro.",
    });
    return;
  }

  try {
    const upstream = await fetch(`${solarProUrl}${pathname}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8_000),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error(
        `[MOBILE_PROXY] upstream ${pathname} error ${upstream.status}: ${text.slice(0, 200)}`,
      );

      if (upstream.status === 401 || upstream.status === 403) {
        res.status(502).json({
          error: "upstream_auth_failed",
          message: "SolarPro pipeline API rejected backend authentication.",
        });
        return;
      }

      if (upstream.status === 404) {
        res.status(404).json({
          error: "not_found",
          message: "Resource not found.",
        });
        return;
      }

      res.status(502).json({
        error: "upstream_error",
        message: "Failed to fetch data from SolarPro pipeline API.",
      });
      return;
    }

    const data = await upstream.json() as unknown;
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[MOBILE_PROXY] upstream ${pathname} fetch error: ${msg}`);
    res.status(502).json({
      error: "upstream_unreachable",
      message: "SolarPro pipeline API is unreachable.",
    });
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/mobile/clients
 *
 * Returns ONLY clients belonging to the authenticated user.
 * User identity comes from req.authUser.email (set by requireAuth middleware).
 * SolarPro scopes the DB query to that user via X-Mobile-User-Email header.
 */
router.get("/clients", async (req: Request, res: Response) => {
  const userEmail = req.authUser?.email;

  if (!userEmail) {
    res.status(400).json({
      error: "missing_user_email",
      message: "Authenticated user has no email in token.",
    });
    return;
  }

  const normalizedEmail = userEmail.trim().toLowerCase();

  if (!validateConfig(res)) return;

  console.log(
    `[MOBILE_SCOPE] GET /clients ` +
    `incomingEmail=${normalizedEmail} source=mobile_api`,
  );

  await proxyToSolarPro("/api/mobile/clients", normalizedEmail, res);
});

/**
 * GET /api/mobile/clients/:clientId/projects
 *
 * Returns ONLY projects for the specified client IF it belongs to the
 * authenticated user. SolarPro enforces the user_id scoping — if the
 * client doesn't belong to the user, SolarPro returns 404.
 */
router.get("/clients/:clientId/projects", async (req: Request, res: Response) => {
  const userEmail = req.authUser?.email;
  const { clientId } = req.params;

  if (!userEmail) {
    res.status(400).json({
      error: "missing_user_email",
      message: "Authenticated user has no email in token.",
    });
    return;
  }

  if (!clientId || typeof clientId !== "string" || !clientId.trim()) {
    res.status(400).json({
      error: "invalid_client_id",
      message: "clientId path parameter is required.",
    });
    return;
  }

  const normalizedEmail = userEmail.trim().toLowerCase();

  if (!validateConfig(res)) return;

  console.log(
    `[MOBILE_SCOPE] GET /clients/${clientId}/projects ` +
    `incomingEmail=${normalizedEmail} source=mobile_api`,
  );

  await proxyToSolarPro(
    `/api/mobile/clients/${encodeURIComponent(clientId)}/projects`,
    normalizedEmail,
    res,
  );
});

export default router;

