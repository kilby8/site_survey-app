/**
 * routes/mobileClients.ts
 *
 * Proxy endpoints that forward client/project lookups to the
 * SolarPro partner API so the mobile app can discover which
 * client and project a survey belongs to before submission.
 *
 * Environment variables:
 *   SOLARPRO_API_URL   – base URL of Raymond's SolarPro backend
 *   SOLARPRO_API_KEY   – optional bearer token for service-to-service auth
 */
import { Router, type Request, type Response } from "express";

const router = Router();

const PARTNER_API_URL = (process.env.SOLARPRO_API_URL ?? "").replace(/\/$/, "");
const PARTNER_API_KEY = process.env.SOLARPRO_API_KEY ?? "";

function partnerHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (PARTNER_API_KEY) {
    headers["Authorization"] = `Bearer ${PARTNER_API_KEY}`;
  }
  return headers;
}

/**
 * GET /api/mobile/clients
 * Returns a list of { id, name } clients from the SolarPro partner API.
 * Falls back to an empty array if the partner API is unreachable so the
 * mobile app degrades gracefully.
 */
router.get("/clients", async (_req: Request, res: Response) => {
  if (!PARTNER_API_URL) {
    // Partner API not configured — return empty list so app doesn't crash
    res.json({ clients: [] });
    return;
  }

  try {
    const upstream = await fetch(`${PARTNER_API_URL}/api/mobile/clients`, {
      headers: partnerHeaders(),
      signal: AbortSignal.timeout(8_000),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error(`[mobileClients] upstream clients error ${upstream.status}: ${text}`);
      res.status(upstream.status).json({ error: "Failed to fetch clients from partner API" });
      return;
    }

    const data = await upstream.json() as unknown;
    res.json(data);
  } catch (err) {
    console.error("[mobileClients] clients fetch error:", err);
    // Return empty list so the app still loads
    res.json({ clients: [] });
  }
});

/**
 * GET /api/mobile/clients/:clientId/projects
 * Returns a list of { id, name, client_id } projects for a given client.
 */
router.get("/clients/:clientId/projects", async (req: Request, res: Response) => {
  const { clientId } = req.params;

  if (!PARTNER_API_URL) {
    res.json({ projects: [] });
    return;
  }

  try {
    const upstream = await fetch(
      `${PARTNER_API_URL}/api/mobile/clients/${encodeURIComponent(clientId)}/projects`,
      {
        headers: partnerHeaders(),
        signal: AbortSignal.timeout(8_000),
      },
    );

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error(`[mobileClients] upstream projects error ${upstream.status}: ${text}`);
      res.status(upstream.status).json({ error: "Failed to fetch projects from partner API" });
      return;
    }

    const data = await upstream.json() as unknown;
    res.json(data);
  } catch (err) {
    console.error("[mobileClients] projects fetch error:", err);
    res.json({ projects: [] });
  }
});

export default router;

