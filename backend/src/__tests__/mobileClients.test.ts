import request from "supertest";
import app from "../index";
import { signAuthToken } from "../utils/authToken";

describe("mobile clients pipeline proxy", () => {
  const originalFetch = global.fetch;
  const originalApiUrl = process.env.SOLARPRO_API_URL;
  const originalApiKey = process.env.SOLARPRO_API_KEY;
  const authHeader = `Bearer ${signAuthToken({
    userId: "test-user-1",
    email: "mobile-clients@example.com",
    role: "admin",
  })}`;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.SOLARPRO_API_URL = originalApiUrl;
    process.env.SOLARPRO_API_KEY = originalApiKey;
    jest.clearAllMocks();
  });


  it("returns 503 when the SolarPro pipeline URL is not configured", async () => {
    delete process.env.SOLARPRO_API_URL;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("not configured");
  });

  it("maps upstream auth failures to 502 so app auth refresh is not triggered", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ success: false, error: "Authentication required" }),
    }) as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(502);
    expect(res.body.error).toContain("authentication");
  });

  it("returns upstream clients payload when the SolarPro pipeline responds successfully", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        clients: [
          { id: "client-1", name: "Acme Solar" },
          { id: "client-2", name: "GridWorks" },
        ],
      }),
    }) as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.clients).toEqual([
      { id: "client-1", name: "Acme Solar" },
      { id: "client-2", name: "GridWorks" },
    ]);
  });

  it("returns upstream projects payload for a selected client", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: [
          { id: "project-1", name: "Warehouse Roof", client_id: "client-1" },
        ],
      }),
    }) as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients/client-1/projects")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.projects).toEqual([
      { id: "project-1", name: "Warehouse Roof", client_id: "client-1" },
    ]);
  });
});

