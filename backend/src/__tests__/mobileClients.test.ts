import request from "supertest";
import app from "../index";
import { signAuthToken } from "../utils/authToken";

describe("mobile clients pipeline proxy", () => {
  const originalFetch = global.fetch;
  const originalApiUrl = process.env.SOLARPRO_API_URL;
  const originalApiKey = process.env.SOLARPRO_API_KEY;
  const originalMobileServiceApiKey = process.env.MOBILE_SERVICE_API_KEY;
  const originalPartnerApiKey = process.env.PARTNER_API_KEY;
  const originalHandoffSecret = process.env.SOLARPRO_HANDOFF_SECRET;
  const originalHandoffFallbacks = process.env.SOLARPRO_HANDOFF_SECRET_FALLBACKS;

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
    process.env.MOBILE_SERVICE_API_KEY = originalMobileServiceApiKey;
    process.env.PARTNER_API_KEY = originalPartnerApiKey;
    process.env.SOLARPRO_HANDOFF_SECRET = originalHandoffSecret;
    process.env.SOLARPRO_HANDOFF_SECRET_FALLBACKS = originalHandoffFallbacks;
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

  it("uses MOBILE_SERVICE_API_KEY when present", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    delete process.env.SOLARPRO_API_KEY;
    process.env.MOBILE_SERVICE_API_KEY = "test-mobile-service-key";

    let capturedAuth = "";
    global.fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedAuth = ((opts.headers ?? {}) as Record<string, string>).Authorization ?? "";
      return Promise.resolve({
        ok: true,
        json: async () => ({ clients: [] }),
      });
    }) as unknown as typeof fetch;

    await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(capturedAuth).toBe("Bearer test-mobile-service-key");
  });

  it("retries the next auth candidate when SolarPro rejects the first one", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    process.env.MOBILE_SERVICE_API_KEY = "bad-mobile-service-key";
    process.env.SOLARPRO_API_KEY = "good-solarpro-api-key";

    const attempts: string[] = [];
    global.fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      const headers = (opts.headers ?? {}) as Record<string, string>;
      const attemptLabel = headers.Authorization
        ? `auth:${headers.Authorization}`
        : `x-api-key:${headers["x-api-key"] ?? ""}`;
      attempts.push(attemptLabel);
      if (attempts.length < 3) {
        return Promise.resolve({
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ error: "unauthorized" }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ clients: [{ id: "client-1" }] }),
      });
    }) as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(attempts[0]).toBe("auth:Bearer bad-mobile-service-key");
    expect(attempts[1]).toBe("x-api-key:bad-mobile-service-key");
    expect(attempts[2]).toBe("auth:Bearer good-solarpro-api-key");
    expect(res.body.clients).toEqual([{ id: "client-1" }]);
  });

  it("falls back to x-api-key header when Bearer auth is rejected", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    process.env.MOBILE_SERVICE_API_KEY = "service-key-123";
    delete process.env.SOLARPRO_API_KEY;
    delete process.env.PARTNER_API_KEY;

    const attempts: string[] = [];
    global.fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      const headers = (opts.headers ?? {}) as Record<string, string>;
      attempts.push(headers.Authorization ? "bearer" : "x-api-key");

      if (attempts.length === 1) {
        return Promise.resolve({
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ error: "unauthorized" }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ clients: [{ id: "client-1" }] }),
      });
    }) as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(attempts).toEqual(["bearer", "x-api-key"]);
  });

  it("uses minted handoff JWT after static service keys fail", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    delete process.env.MOBILE_SERVICE_API_KEY;
    delete process.env.SOLARPRO_API_KEY;
    delete process.env.PARTNER_API_KEY;
    process.env.SOLARPRO_HANDOFF_SECRET = "test-handoff-secret-value-that-is-long-enough-123456";

    let capturedAuth = "";
    global.fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedAuth = ((opts.headers ?? {}) as Record<string, string>).Authorization ?? "";
      return Promise.resolve({
        ok: true,
        json: async () => ({ clients: [] }),
      });
    }) as unknown as typeof fetch;

    await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(capturedAuth).toMatch(/^Bearer eyJ/);
  });

  it("uses fallback handoff secret JWT if the primary handoff secret is rejected", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    delete process.env.MOBILE_SERVICE_API_KEY;
    delete process.env.SOLARPRO_API_KEY;
    delete process.env.PARTNER_API_KEY;
    process.env.SOLARPRO_HANDOFF_SECRET = "primary-handoff-secret-value-that-is-long-enough-123456";
    process.env.SOLARPRO_HANDOFF_SECRET_FALLBACKS = "fallback-handoff-secret-value-that-is-long-enough-654321";

    const attempts: string[] = [];
    global.fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      const headers = (opts.headers ?? {}) as Record<string, string>;
      attempts.push(headers.Authorization ?? "");

      if (attempts.length === 1) {
        return Promise.resolve({
          ok: false,
          status: 403,
          text: async () => JSON.stringify({ error: "forbidden" }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ clients: [{ id: "client-1" }] }),
      });
    }) as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    expect(attempts[0]).toMatch(/^Bearer eyJ/);
    expect(attempts[1]).toMatch(/^Bearer eyJ/);
    expect(attempts[0]).not.toBe(attempts[1]);
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

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        clients: [
          { id: "client-1", name: "Acme Solar" },
          { id: "client-2", name: "GridWorks" },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.clients).toEqual([
      { id: "client-1", name: "Acme Solar" },
      { id: "client-2", name: "GridWorks" },
    ]);
    const fetchHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(fetchHeaders["X-Mobile-User-Email"]).toBe("mobile-clients@example.com");
  });

  it("returns upstream projects payload for a selected client", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    process.env.SOLARPRO_API_KEY = "test-service-key";

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: [
          { id: "project-1", name: "Warehouse Roof", client_id: "client-1" },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients/client-1/projects")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.projects).toEqual([
      { id: "project-1", name: "Warehouse Roof", client_id: "client-1" },
    ]);
    const fetchHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(fetchHeaders["X-Mobile-User-Email"]).toBe("mobile-clients@example.com");
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