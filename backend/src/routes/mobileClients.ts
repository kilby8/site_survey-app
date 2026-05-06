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
 *   SOLARPRO_API_URL   — base URL of SolarPro backend (required)
 *   SOLARPRO_API_KEY   — service-to-service bearer token (required)
 */

import { Router, type Request, type Response } from "express";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSolarProUrl(): string {
  return (process.env.SOLARPRO_API_URL ?? "").trim().replace(/\/$/, "");
}

function getSolarProApiKey(): string {
  return (process.env.SOLARPRO_API_KEY ?? "").trim();
}

/**
 * Build proxy headers for SolarPro service-to-service requests.
 * CRITICAL: X-Mobile-User-Email scopes the SolarPro query to the correct user.
 */
function buildProxyHeaders(userEmail: string): Record<string, string> {
  const apiKey = getSolarProApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    // Scope the SolarPro query to this specific user — without this header,
    // SolarPro falls back to the service account and returns wrong user's data.
    "X-Mobile-User-Email": userEmail.trim().toLowerCase(),
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Validates that SOLARPRO_API_URL and SOLARPRO_API_KEY are configured.
 * Returns true if valid, false + sends 503 if not.
 */
function validateConfig(res: Response): boolean {
  const url = getSolarProUrl();
  const key = getSolarProApiKey();

  if (!url) {
    res.status(503).json({
      error: "configuration_error",
      message: "SOLARPRO_API_URL is not configured on this server.",
    });
    return false;
  }

  if (!key) {
    res.status(503).json({
      error: "configuration_error",
      message: "SOLARPRO_API_KEY is not configured on this server.",
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

  try {
    const upstream = await fetch(`${solarProUrl}${pathname}`, {
      method: "GET",
      headers: buildProxyHeaders(userEmail),
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

