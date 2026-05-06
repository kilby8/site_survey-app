import request from "supertest";
import app from "../index";
import { signAuthToken } from "../utils/authToken";

describe("mobile clients pipeline proxy", () => {
  const originalFetch = global.fetch;
  const originalApiUrl = process.env.SOLARPRO_API_URL;
  const originalApiKey = process.env.SOLARPRO_API_KEY;

  const TEST_EMAIL = "mobile-clients@example.com";
  const authHeader = `Bearer ${signAuthToken({
    userId: "test-user-1",
    email: TEST_EMAIL,
    role: "admin",
  })}`;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.SOLARPRO_API_URL = originalApiUrl;
    process.env.SOLARPRO_API_KEY = originalApiKey;
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Configuration validation
  // -------------------------------------------------------------------------

  it("returns 503 when the SolarPro pipeline URL is not configured", async () => {
    delete process.env.SOLARPRO_API_URL;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(503);
    // message field contains the human-readable explanation
    expect(res.body.message).toContain("not configured");
  });

  // -------------------------------------------------------------------------
  // User scoping — X-Mobile-User-Email must be forwarded
  // -------------------------------------------------------------------------

  it("forwards X-Mobile-User-Email header to SolarPro with normalized email", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    process.env.SOLARPRO_API_KEY = "test-service-key";

    let capturedHeaders: Record<string, string> = {};

    global.fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedHeaders = (opts.headers ?? {}) as Record<string, string>;
      return Promise.resolve({
        ok: true,
        json: async () => ({ clients: [] }),
      });
    }) as unknown as typeof fetch;

    await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    // CRITICAL: X-Mobile-User-Email must be forwarded so SolarPro scopes
    // the DB query to the correct user — without it, SolarPro falls back
    // to the service account and returns the wrong user's data.
    expect(capturedHeaders["X-Mobile-User-Email"]).toBe(TEST_EMAIL.toLowerCase());
  });

  it("normalizes email to lowercase before forwarding", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    process.env.SOLARPRO_API_KEY = "test-service-key";

    const mixedCaseToken = `Bearer ${signAuthToken({
      userId: "test-user-2",
      email: "Mixed.Case@Example.COM",
      role: "user",
    })}`;

    let capturedEmail = "";
    global.fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedEmail = ((opts.headers ?? {}) as Record<string, string>)["X-Mobile-User-Email"] ?? "";
      return Promise.resolve({
        ok: true,
        json: async () => ({ clients: [] }),
      });
    }) as unknown as typeof fetch;

    await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", mixedCaseToken);

    expect(capturedEmail).toBe("mixed.case@example.com");
  });

  // -------------------------------------------------------------------------
  // Error mapping
  // -------------------------------------------------------------------------

  it("maps upstream auth failures (401/403) to 502 so app auth refresh is not triggered", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    process.env.SOLARPRO_API_KEY = "test-service-key";

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ success: false, error: "Authentication required" }),
    }) as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("upstream_auth_failed");
  });

  it("returns 502 when upstream returns a non-auth error", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    process.env.SOLARPRO_API_KEY = "test-service-key";

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }) as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("upstream_error");
  });

  it("returns 502 when SolarPro is unreachable (network error)", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    process.env.SOLARPRO_API_KEY = "test-service-key";

    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("upstream_unreachable");
  });

  // -------------------------------------------------------------------------
  // Successful data passthrough
  // -------------------------------------------------------------------------

  it("returns upstream clients payload when the SolarPro pipeline responds successfully", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    process.env.SOLARPRO_API_KEY = "test-service-key";

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
    process.env.SOLARPRO_API_KEY = "test-service-key";

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

  it("passes correct clientId in upstream URL for projects request", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    process.env.SOLARPRO_API_KEY = "test-service-key";

    let capturedUrl = "";
    global.fetch = jest.fn().mockImplementation((url: string) => {
      capturedUrl = url as string;
      return Promise.resolve({
        ok: true,
        json: async () => ({ projects: [] }),
      });
    }) as unknown as typeof fetch;

    await request(app)
      .get("/api/mobile/clients/abc-123/projects")
      .set("Authorization", authHeader);

    expect(capturedUrl).toContain("/api/mobile/clients/abc-123/projects");
  });

  // -------------------------------------------------------------------------
  // Auth required
  // -------------------------------------------------------------------------

  it("returns 401 when no Authorization header is provided", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";

    const res = await request(app).get("/api/mobile/clients");

    expect(res.status).toBe(401);
  });

  it("returns 401 when an invalid token is provided", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", "Bearer not-a-valid-jwt");

    expect(res.status).toBe(401);
  });
});