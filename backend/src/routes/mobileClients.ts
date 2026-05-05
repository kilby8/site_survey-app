/**
 * routes/mobileClients.ts
 *
 * Client/project lookup endpoints for the mobile app.
 *
 * Supported mode:
 * - Proxy to Raymond's website pipeline API when SOLARPRO_API_URL is configured.
 *
 * Environment variables:
 *   SOLARPRO_API_URL   – (optional) base URL of Raymond's SolarPro backend
 *   SOLARPRO_API_KEY   – (optional) bearer token for service-to-service auth
 */
import { Router, type Request, type Response } from "express";

const router = Router();

function getPartnerApiUrl(): string {
  return (process.env.SOLARPRO_API_URL ?? "").trim().replace(/\/$/, "");
}

function getPartnerApiKey(): string {
  return (process.env.SOLARPRO_API_KEY ?? "").trim();
}

function partnerHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const partnerApiKey = getPartnerApiKey();
  if (partnerApiKey) {
    headers["Authorization"] = `Bearer ${partnerApiKey}`;
  }
  return headers;
}

function partnerIntegrationMissing(res: Response): void {
  res.status(503).json({
    error: "SolarPro pipeline API is not configured",
  });
}

async function proxyPartnerJson(pathname: string, res: Response): Promise<boolean> {
  const partnerApiUrl = getPartnerApiUrl();

  if (!partnerApiUrl) {
    partnerIntegrationMissing(res);
    return true;
  }

  try {
    const upstream = await fetch(`${partnerApiUrl}${pathname}`, {
      headers: partnerHeaders(),
      signal: AbortSignal.timeout(8_000),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error(`[mobileClients] upstream ${pathname} error ${upstream.status}: ${text}`);
      res.status(502).json({
        error: upstream.status === 401 || upstream.status === 403
          ? "SolarPro pipeline API rejected backend authentication"
          : "Failed to fetch data from SolarPro pipeline API",
      });
      return true;
    }

    const data = await upstream.json() as unknown;
    res.json(data);
    return true;
  } catch (err) {
    console.error(`[mobileClients] upstream ${pathname} fetch error:`, err);
    res.status(502).json({ error: "SolarPro pipeline API is unreachable" });
    return true;
  }
}

/**
 * GET /api/mobile/clients
 * Returns a list of { id, name } clients from Raymond's website pipeline.
 */
router.get("/clients", async (_req: Request, res: Response) => {
  await proxyPartnerJson("/api/mobile/clients", res);
});

/**
 * GET /api/mobile/clients/:clientId/projects
 * Returns a list of { id, name, client_id } projects for a given client.
 */
router.get("/clients/:clientId/projects", async (req: Request, res: Response) => {
  const { clientId } = req.params;
  await proxyPartnerJson(`/api/mobile/clients/${encodeURIComponent(clientId)}/projects`, res);
});

export default router;

