/**
 * routes/mobileClients.ts
 *
 * Client/project lookup endpoints for the mobile app.
 *
 * Supported modes:
 * 1. If SOLARPRO_API_URL is configured, proxy to the SolarPro partner API
 * 2. If not, fall back to querying the app's own projects table
 *
 * Environment variables:
 *   SOLARPRO_API_URL   – (optional) base URL of Raymond's SolarPro backend
 *   SOLARPRO_API_KEY   – (optional) bearer token for service-to-service auth
 */
import { Router, type Request, type Response } from "express";
import { pool } from "../database.js";

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
 * Returns a list of { id, name } clients.
 * If SOLARPRO_API_URL is configured, proxies to the partner API.
 * Otherwise, returns distinct clients from the app's projects table.
 */
router.get("/clients", async (_req: Request, res: Response) => {
  if (PARTNER_API_URL) {
    // Partner API configured — use it as primary source
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
      return;
    } catch (err) {
      console.error("[mobileClients] clients fetch error:", err);
      // Fall through to app DB fallback if upstream fails
    }
  }

  // Fall back to querying app's projects table for distinct clients
  try {
    const result = await pool.query(
      `SELECT DISTINCT client as id, client as name FROM projects WHERE client IS NOT NULL AND client != '' ORDER BY client`,
    );
    const clients = result.rows.map((row) => ({ id: row.id, name: row.name }));
    res.json({ clients });
  } catch (err) {
    console.error("[mobileClients] app DB query error:", err);
    res.json({ clients: [] });
  }
});

/**
 * GET /api/mobile/clients/:clientId/projects
 * Returns a list of { id, name, client_id } projects for a given client.
 * If SOLARPRO_API_URL is configured, proxies to the partner API.
 * Otherwise, queries the app's projects table.
 */
router.get("/clients/:clientId/projects", async (req: Request, res: Response) => {
  const { clientId } = req.params;

  if (PARTNER_API_URL) {
    // Partner API configured — use it as primary source
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
      return;
    } catch (err) {
      console.error("[mobileClients] projects fetch error:", err);
      // Fall through to app DB fallback if upstream fails
    }
  }

  // Fall back to querying app's projects table
  try {
    const result = await pool.query(
      `SELECT id, name, client as client_id FROM projects WHERE client = $1 ORDER BY name`,
      [clientId],
    );
    const projects = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      client_id: row.client_id,
    }));
    res.json({ projects });
  } catch (err) {
    console.error("[mobileClients] app DB query error:", err);
    res.json({ projects: [] });
  }
});

export default router;

