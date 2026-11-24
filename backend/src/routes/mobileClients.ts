/**
 * routes/mobileClients.ts
 *
 * PHASE 4.15.4 — USER-SCOPED MOBILE DATA (HARDENED)
 *
 * Client/project lookup endpoints for the mobile app.
 * Proxies to SolarPro's /api/mobile/* with strict user scoping.
 *
 * Auth model (signed email token, since 2026-11-24):
 *   - Mobile app authenticates with this Render backend via JWT (requireAuth middleware)
 *   - This backend proxies to SolarPro with one short-lived token per request:
 *       Authorization: Bearer <HS256 {email: req.authUser.email, exp: now + 300}>
 *     signed with SOLARPRO_HANDOFF_SECRET. SolarPro verifies it and scopes the data to
 *     that email's user (lib/mobile/auth.ts Path C). An email-only token must end
 *     within 10 minutes, or SolarPro refuses it.
 *   - The old shared service key (MOBILE_SERVICE_API_KEY / SOLARPRO_API_KEY /
 *     PARTNER_API_KEY) plus a free-text X-Mobile-User-Email header is no longer
 *     sent: it let whoever held the one key name any user. SolarPro turns that
 *     path off (MOBILE_SERVICE_KEY_PATH=on there is an emergency switch only).
 *
 * Environment variables:
 *   SOLARPRO_API_URL                  — base URL of SolarPro backend (required)
 *   SOLARPRO_HANDOFF_SECRET           — signs the per-request token (required, >= 32 chars)
 *   SOLARPRO_HANDOFF_SECRET_FALLBACKS — comma-separated older secrets, tried in order
 *                                       during a rotation
 */

import jwt from "jsonwebtoken";
import { Router, type Request, type Response } from "express";
import {
  validateAddressWithGoogle,
  reverseGeocodeWithGoogle,
} from "../services/googleMapsService";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSolarProUrl(): string {
  return (process.env.SOLARPRO_API_URL ?? "").trim().replace(/\/$/, "");
}

type AuthStrategy = {
  id: string;
  headers: Record<string, string>;
};

function getSolarProHandoffSecrets(): string[] {
  const primary = (process.env.SOLARPRO_HANDOFF_SECRET ?? "").trim();
  const fallbackRaw = process.env.SOLARPRO_HANDOFF_SECRET_FALLBACKS ?? "";
  const fallbacks = fallbackRaw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length >= 32);

  return Array.from(new Set([primary, ...fallbacks].filter((value) => value.length >= 32)));
}

/**
 * Mint a short-lived HS256 JWT for service-to-service auth with SolarPro.
 *
 * Signed with SOLARPRO_HANDOFF_SECRET (or a rotation fallback) — the secret
 * already shared between Render and Vercel for handoff tokens. The token
 * carries the mobile user's email so SolarPro can resolve the correct userId
 * (Path C in lib/mobile/auth.ts). jsonwebtoken's noTimestamp drops the iat set
 * below, so the signed claims are {email, exp}.
 */
function mintServiceJwtWithSecret(userEmail: string, secret: string): string | null {
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
 * One signed token per handoff secret: the current one first, then any rotation
 * fallbacks. The strategy id names the secret's position, never any part of it,
 * because ids are written to the logs.
 */
function getProxyAuthStrategies(userEmail: string): AuthStrategy[] {
  const strategies: AuthStrategy[] = [];

  getSolarProHandoffSecrets().forEach((handoffSecret, index) => {
    const jwtToken = mintServiceJwtWithSecret(userEmail, handoffSecret);
    if (!jwtToken) return;
    strategies.push({
      id: index === 0 ? "jwt:current" : `jwt:fallback-${index}`,
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    });
  });

  // getSolarProHandoffSecrets() already drops repeated secrets, so each token is unique.
  return strategies;
}

/**
 * Validates that SOLARPRO_API_URL and a signing secret (SOLARPRO_HANDOFF_SECRET,
 * or a rotation fallback, at least 32 characters) are configured.
 * Returns true if valid, false + sends 503 if not.
 */
function validateConfig(res: Response): boolean {
  const url = getSolarProUrl();

  if (!url) {
    res.status(503).json({
      error: "configuration_error",
      message: "SOLARPRO_API_URL is not configured on this server.",
    });
    return false;
  }

  if (getSolarProHandoffSecrets().length === 0) {
    res.status(503).json({
      error: "configuration_error",
      message:
        "Configure SOLARPRO_HANDOFF_SECRET (min 32 chars) to sign the per-request token for SolarPro.",
    });
    return false;
  }

  return true;
}

type SolarProFetchResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: string; message: string };

/**
 * Fetch from SolarPro and return a typed result WITHOUT writing to res.
 * Use this when the caller needs to inspect the result before responding
 * (e.g. for graceful fallback logic).
 */
async function fetchFromSolarPro(
  pathname: string,
  userEmail: string,
  requestInit?: { method?: "GET" | "POST"; body?: unknown },
): Promise<SolarProFetchResult> {
  const solarProUrl = getSolarProUrl();
  const method = requestInit?.method ?? "GET";
  const serializedBody =
    method === "POST" && typeof requestInit?.body !== "undefined"
      ? JSON.stringify(requestInit.body)
      : undefined;

  const authStrategies = getProxyAuthStrategies(userEmail);
  if (authStrategies.length === 0) {
    return {
      ok: false,
      status: 503,
      error: "configuration_error",
      message: "No mobile proxy auth secret is set — cannot authenticate with SolarPro.",
    };
  }

  try {
    let lastAuthFailureText = "";

    for (let i = 0; i < authStrategies.length; i += 1) {
      const strategy = authStrategies[i];
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...strategy.headers,
      };

      const upstream = await fetch(`${solarProUrl}${pathname}`, {
        method,
        headers,
        body: serializedBody,
        signal: AbortSignal.timeout(8_000),
      });

      if (upstream.ok) {
        const data = (await upstream.json()) as unknown;
        return { ok: true, data };
      }

      const text = await upstream.text().catch(() => "");
      console.error(
        `[MOBILE_PROXY] upstream ${pathname} error ${upstream.status}: ${text.slice(0, 200)}`,
      );

      if (upstream.status === 401 || upstream.status === 403) {
        lastAuthFailureText = text;
        if (i < authStrategies.length - 1) continue;
        return { ok: false, status: 502, error: "upstream_auth_failed", message: "SolarPro pipeline API rejected backend authentication." };
      }

      if (upstream.status === 404) {
        return { ok: false, status: 404, error: "not_found", message: "Resource not found." };
      }

      return { ok: false, status: 502, error: "upstream_error", message: "Failed to fetch data from SolarPro pipeline API." };
    }

    console.error(`[MOBILE_PROXY] upstream ${pathname} auth exhausted: ${lastAuthFailureText?.slice(0, 200)}`);
    return { ok: false, status: 502, error: "upstream_auth_failed", message: "SolarPro pipeline API rejected backend authentication." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[MOBILE_PROXY] upstream ${method} ${pathname} fetch error: ${msg}`);
    return { ok: false, status: 502, error: "upstream_unreachable", message: "SolarPro pipeline API is unreachable." };
  }
}

/**
 * Proxy a request to SolarPro and forward the response.
 * The authenticated user's email travels inside the signed token.
 */
async function proxyToSolarPro(
  pathname: string,
  userEmail: string,
  res: Response,
  requestInit?: {
    method?: "GET" | "POST";
    body?: unknown;
  },
): Promise<void> {
  const solarProUrl = getSolarProUrl();
  const method = requestInit?.method ?? "GET";
  const serializedBody =
    method === "POST" && typeof requestInit?.body !== "undefined"
      ? JSON.stringify(requestInit.body)
      : undefined;

  const authStrategies = getProxyAuthStrategies(userEmail);
  if (authStrategies.length === 0) {
    res.status(503).json({
      error: "configuration_error",
      message: "No mobile proxy auth secret is set — cannot authenticate with SolarPro.",
    });
    return;
  }

  try {
    let lastAuthFailureText = "";

    for (let i = 0; i < authStrategies.length; i += 1) {
      const strategy = authStrategies[i];
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...strategy.headers,
      };

      const upstream = await fetch(`${solarProUrl}${pathname}`, {
        method,
        headers,
        body: serializedBody,
        signal: AbortSignal.timeout(8_000),
      });

      if (upstream.ok) {
        const data = (await upstream.json()) as unknown;
        res.json(data);
        return;
      }

      const text = await upstream.text().catch(() => "");
      console.error(
        `[MOBILE_PROXY] upstream ${pathname} error ${upstream.status}: ${text.slice(0, 200)}`,
      );

      if (upstream.status === 401 || upstream.status === 403) {
        lastAuthFailureText = text;
        if (i < authStrategies.length - 1) {
          console.warn(
            `[MOBILE_PROXY] auth rejected via ${strategy.id}; trying next auth strategy (${i + 2}/${authStrategies.length})`,
          );
          continue;
        }

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

    console.error(`[MOBILE_PROXY] upstream ${pathname} auth exhausted: ${lastAuthFailureText.slice(0, 200)}`);
    res.status(502).json({
      error: "upstream_auth_failed",
      message: "SolarPro pipeline API rejected backend authentication.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[MOBILE_PROXY] upstream ${method} ${pathname} fetch error: ${msg}`);
    res.status(502).json({
      error: "upstream_unreachable",
      message: "SolarPro pipeline API is unreachable.",
    });
  }
}

type AddressValidationBody = {
  rawAddress: string;
  gps: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  placeId?: string;
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/mobile/clients
 *
 * Returns ONLY clients belonging to the authenticated user.
 * User identity comes from req.authUser.email (set by requireAuth middleware).
 * SolarPro scopes the DB query to the email inside the signed token.
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
 * GET /api/mobile/projects/:projectId
 *
 * Returns full detail for a single project (including installation_type,
 * system_type, and other fields not always present in the list endpoint).
 * Proxied to SolarPro with user-email scoping.
 */
router.get("/projects/:projectId", async (req: Request, res: Response) => {
  const userEmail = req.authUser?.email;
  const { projectId } = req.params;

  if (!userEmail) {
    res.status(400).json({ error: "missing_user_email", message: "Authenticated user has no email in token." });
    return;
  }

  if (!projectId?.trim()) {
    res.status(400).json({ error: "invalid_project_id", message: "projectId path parameter is required." });
    return;
  }

  const normalizedEmail = userEmail.trim().toLowerCase();
  if (!validateConfig(res)) return;

  console.log(`[MOBILE_SCOPE] GET /projects/${projectId} incomingEmail=${normalizedEmail}`);
  await proxyToSolarPro(`/api/mobile/projects/${encodeURIComponent(projectId)}`, normalizedEmail, res);
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

/**
 * POST /api/mobile/address-validation
 *
 * Proxies address + GPS payload to SolarPro for normalization/validation.
 * GPS coordinates are mandatory to preserve capture-to-address verification.
 */
router.post("/address-validation", async (req: Request, res: Response) => {
  const userEmail = req.authUser?.email;

  if (!userEmail) {
    res.status(400).json({
      error: "missing_user_email",
      message: "Authenticated user has no email in token.",
    });
    return;
  }

  const body = (req.body || {}) as Partial<AddressValidationBody>;
  const rawAddress = String(body.rawAddress || "").trim();
  const gps = body.gps as AddressValidationBody["gps"] | undefined;
  const placeId = typeof body.placeId === "string" && body.placeId.trim()
    ? body.placeId.trim()
    : undefined;

  if (!rawAddress) {
    res.status(400).json({
      error: "invalid_address",
      message: "rawAddress is required.",
    });
    return;
  }

  if (!gps || !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) {
    res.status(400).json({
      error: "invalid_gps",
      message: "gps.latitude and gps.longitude are required numbers.",
    });
    return;
  }

  if (gps.latitude < -90 || gps.latitude > 90 || gps.longitude < -180 || gps.longitude > 180) {
    res.status(400).json({
      error: "invalid_gps_range",
      message: "gps.latitude must be between -90..90 and gps.longitude between -180..180.",
    });
    return;
  }

  const normalizedEmail = userEmail.trim().toLowerCase();

  if (!validateConfig(res)) return;

  console.log(
    `[MOBILE_SCOPE] POST /address-validation ` +
    `incomingEmail=${normalizedEmail} source=mobile_api`,
  );

  // 1) Attempt Google Geocoding first (Geocoding API via address or reverse-geocoding via GPS)
  try {
    const googleResult = await validateAddressWithGoogle(rawAddress, gps.latitude, gps.longitude, placeId);
    if (googleResult) {
      console.log(`[MOBILE_SCOPE] Address validated via Google Maps API for ${normalizedEmail}`);
      res.json(googleResult);
      return;
    }
  } catch (err) {
    console.error(`[MOBILE_SCOPE] Google validation fallback trigger: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2) Fall back to SolarPro's upstream mobile endpoint to preserve the existing
  //    contract for clients that still expect backend proxy behavior.
  const upstreamValidation = await fetchFromSolarPro(
    "/api/mobile/address-validation",
    normalizedEmail,
    {
      method: "POST",
      body: {
        rawAddress,
        gps,
        ...(placeId ? { placeId } : {}),
      },
    },
  );

  if (upstreamValidation.ok) {
    console.log(`[MOBILE_SCOPE] Address validated via SolarPro upstream for ${normalizedEmail}`);
    res.json(upstreamValidation.data);
    return;
  }

  // 3) If both Google validation and SolarPro validation are unavailable, return
  //    a local needs_review fallback so the mobile workflow remains usable.
  res.json({
    isValid: false,
    formattedAddress: rawAddress,
    granularity: "UNKNOWN",
    gps: { latitude: gps.latitude, longitude: gps.longitude },
    source: "fallback",
    needsReview: true,
    fallbackReason: "Address validation service is unavailable — please confirm the address manually.",
    upstreamStatus: upstreamValidation.status,
    upstreamError: upstreamValidation.error,
  });
  return;
});

/**
 * POST /api/mobile/reverse-geocode
 *
 * Suggests an address based on GPS coordinates.
 */
router.post("/reverse-geocode", async (req: Request, res: Response) => {
  const { latitude, longitude } = (req.body || {}) as {
    latitude?: number;
    longitude?: number;
  };

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    res.status(400).json({ error: "latitude and longitude are required numbers." });
    return;
  }

  const address = await reverseGeocodeWithGoogle(latitude!, longitude!);
  if (!address) {
    res.status(404).json({ error: "Could not suggest address for these coordinates." });
    return;
  }

  res.json({ address });
});

export default router;

