import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../index";
import { signAuthToken } from "../utils/authToken";

// The Render proxy proves who is calling SolarPro with one signed email token per
// request (SOLARPRO_HANDOFF_SECRET). It never sends a shared service key or a
// free-text X-Mobile-User-Email header (since 2026-11-24).
const SIGNING_SECRET = "test-handoff-secret-value-that-is-long-enough-0123456789";

/** Verifies the Bearer token with the given secret and returns its claims. */
function signedClaims(
  headers: Record<string, string>,
  secret: string = SIGNING_SECRET,
): Record<string, unknown> {
  const raw = (headers.Authorization ?? "").replace(/^Bearer\s+/, "");
  return jwt.verify(raw, secret, { algorithms: ["HS256"] }) as Record<string, unknown>;
}

describe("mobile clients pipeline proxy", () => {
  const originalFetch = global.fetch;
  const originalApiUrl = process.env.SOLARPRO_API_URL;
  const originalApiKey = process.env.SOLARPRO_API_KEY;
  const originalMobileServiceApiKey = process.env.MOBILE_SERVICE_API_KEY;
  const originalPartnerApiKey = process.env.PARTNER_API_KEY;
  const originalHandoffSecret = process.env.SOLARPRO_HANDOFF_SECRET;
  const originalHandoffFallbacks = process.env.SOLARPRO_HANDOFF_SECRET_FALLBACKS;

  const TEST_EMAIL = "mobile-clients@example.com";

  function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  const authHeader = `Bearer ${signAuthToken({
    userId: "test-user-1",
    email: TEST_EMAIL,
    role: "admin",
  })}`;

  beforeEach(() => {
    process.env.SOLARPRO_HANDOFF_SECRET = SIGNING_SECRET;
    delete process.env.SOLARPRO_HANDOFF_SECRET_FALLBACKS;
    delete process.env.MOBILE_SERVICE_API_KEY;
    delete process.env.SOLARPRO_API_KEY;
    delete process.env.PARTNER_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    restoreEnv("SOLARPRO_API_URL", originalApiUrl);
    restoreEnv("SOLARPRO_API_KEY", originalApiKey);
    restoreEnv("MOBILE_SERVICE_API_KEY", originalMobileServiceApiKey);
    restoreEnv("PARTNER_API_KEY", originalPartnerApiKey);
    restoreEnv("SOLARPRO_HANDOFF_SECRET", originalHandoffSecret);
    restoreEnv("SOLARPRO_HANDOFF_SECRET_FALLBACKS", originalHandoffFallbacks);
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

  it("returns 503 when no signing secret of at least 32 characters is set", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    process.env.SOLARPRO_HANDOFF_SECRET = "too-short-secret";
    // A shared service key is no longer a way in, so it cannot stand in for the secret.
    process.env.MOBILE_SERVICE_API_KEY = "mobile-service-key-that-is-long-enough-000001";

    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(503);
    expect(res.body.message).toContain("SOLARPRO_HANDOFF_SECRET");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // User scoping — the user's email travels inside the signed token
  // -------------------------------------------------------------------------

  it("signs the user's email into a five-minute token and sends no email header", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";

    let capturedHeaders: Record<string, string> = {};
    global.fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      capturedHeaders = (opts.headers ?? {}) as Record<string, string>;
      return Promise.resolve({
        ok: true,
        json: async () => ({ clients: [] }),
      });
    }) as unknown as typeof fetch;

    const before = Math.floor(Date.now() / 1000);
    await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    // CRITICAL: SolarPro scopes the data to the email inside the signed token
    // (lib/mobile/auth.ts Path C). A header can be set by anyone who holds a key.
    const claims = signedClaims(capturedHeaders);
    expect(claims.email).toBe(TEST_EMAIL.toLowerCase());
    // jsonwebtoken's noTimestamp drops iat, so the token is exactly {email, exp}.
    expect(Object.keys(claims).sort()).toEqual(["email", "exp"]);
    const exp = claims.exp as number;
    expect(exp - before).toBeGreaterThanOrEqual(295);
    expect(exp - before).toBeLessThanOrEqual(305);
    expect(capturedHeaders["X-Mobile-User-Email"]).toBeUndefined();
    expect(capturedHeaders["x-api-key"]).toBeUndefined();
  });

  it("never sends a shared service key, even when one is set", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    const keys = [
      "mobile-service-key-that-is-long-enough-000001",
      "solarpro-api-key-that-is-long-enough-0000002",
      "partner-api-key-that-is-long-enough-00000003",
    ];
    process.env.MOBILE_SERVICE_API_KEY = keys[0];
    process.env.SOLARPRO_API_KEY = keys[1];
    process.env.PARTNER_API_KEY = keys[2];

    const sent: Array<Record<string, string>> = [];
    global.fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      sent.push((opts.headers ?? {}) as Record<string, string>);
      return Promise.resolve({
        ok: true,
        json: async () => ({ clients: [] }),
      });
    }) as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(signedClaims(sent[0]).email).toBe(TEST_EMAIL.toLowerCase());
    const everything = JSON.stringify(sent);
    for (const key of keys) {
      expect(everything).not.toContain(key);
    }
  });

  it("makes one attempt with one secret and maps a refusal to 502", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    process.env.SOLARPRO_API_KEY = "solarpro-api-key-that-is-long-enough-0000002";

    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "unauthorized" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await request(app)
      .get("/api/mobile/clients")
      .set("Authorization", authHeader);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("upstream_auth_failed");
    // No second try with a static key after the signed token is refused.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tries the rotation fallback secret when SolarPro refuses the current one", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";
    const primary = "primary-handoff-secret-value-that-is-long-enough-123456";
    const fallback = "fallback-handoff-secret-value-that-is-long-enough-654321";
    process.env.SOLARPRO_HANDOFF_SECRET = primary;
    process.env.SOLARPRO_HANDOFF_SECRET_FALLBACKS = fallback;

    const attempts: Array<Record<string, string>> = [];
    global.fetch = jest.fn().mockImplementation((_url: string, opts: RequestInit) => {
      attempts.push((opts.headers ?? {}) as Record<string, string>);

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
    expect(attempts).toHaveLength(2);
    expect(signedClaims(attempts[0], primary).email).toBe(TEST_EMAIL.toLowerCase());
    expect(signedClaims(attempts[1], fallback).email).toBe(TEST_EMAIL.toLowerCase());
  });

  it("normalizes email to lowercase inside the token", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";

    const mixedCaseToken = `Bearer ${signAuthToken({
      userId: "test-user-2",
      email: "Mixed.Case@Example.COM",
      role: "user",
    })}`;

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
      .set("Authorization", mixedCaseToken);

    expect(signedClaims(capturedHeaders).email).toBe("mixed.case@example.com");
  });

  // -------------------------------------------------------------------------
  // Error mapping
  // -------------------------------------------------------------------------

  it("maps upstream auth failures (401/403) to 502 so app auth refresh is not triggered", async () => {
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
    expect(res.body.error).toBe("upstream_auth_failed");
  });

  it("returns 502 when upstream returns a non-auth error", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";

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
    expect(signedClaims(fetchHeaders).email).toBe("mobile-clients@example.com");
    expect(fetchHeaders["X-Mobile-User-Email"]).toBeUndefined();
  });

  it("returns upstream projects payload for a selected client", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";

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
    expect(signedClaims(fetchHeaders).email).toBe("mobile-clients@example.com");
    expect(fetchHeaders["X-Mobile-User-Email"]).toBeUndefined();
  });

  it("passes correct clientId in upstream URL for projects request", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";

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

  it("returns 400 when address-validation payload is missing rawAddress", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";

    const res = await request(app)
      .post("/api/mobile/address-validation")
      .set("Authorization", authHeader)
      .send({
        gps: {
          latitude: 32.7767,
          longitude: -96.797,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_address");
  });

  it("returns 400 when address-validation payload has invalid GPS", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";

    const res = await request(app)
      .post("/api/mobile/address-validation")
      .set("Authorization", authHeader)
      .send({
        rawAddress: "123 Main St, Dallas, TX",
        gps: {
          latitude: 999,
          longitude: -96.797,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_gps_range");
  });

  it("proxies address-validation payload to upstream with POST and scoped headers", async () => {
    process.env.SOLARPRO_API_URL = "https://solarpro-dev.vercel.app";

    let capturedUrl = "";
    let capturedMethod = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> | null = null;

    global.fetch = jest.fn().mockImplementation((url: string, opts: RequestInit) => {
      capturedUrl = url;
      capturedMethod = String(opts.method || "GET");
      const headers = (opts.headers ?? {}) as Record<string, string>;
      capturedHeaders = headers;
      capturedBody = JSON.parse(String(opts.body || "{}"));

      return Promise.resolve({
        ok: true,
        json: async () => ({
          result: {
            isValid: true,
            formattedAddress: "123 MAIN ST, DALLAS, TX 75201",
            granularity: "PREMISE",
            gps: {
              latitude: 32.7767,
              longitude: -96.797,
            },
          },
        }),
      });
    }) as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/mobile/address-validation")
      .set("Authorization", authHeader)
      .send({
        rawAddress: "123 Main St, Dallas, TX",
        gps: {
          latitude: 32.7767,
          longitude: -96.797,
          accuracy: 8,
        },
      });

    expect(res.status).toBe(200);
    expect(capturedUrl).toContain("/api/mobile/address-validation");
    expect(capturedMethod).toBe("POST");
    expect(signedClaims(capturedHeaders).email).toBe(TEST_EMAIL.toLowerCase());
    expect(capturedHeaders["X-Mobile-User-Email"]).toBeUndefined();
    expect(capturedBody).toMatchObject({
      rawAddress: "123 Main St, Dallas, TX",
      gps: {
        latitude: 32.7767,
        longitude: -96.797,
        accuracy: 8,
      },
    });
    expect(res.body.result?.isValid).toBe(true);
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

// ---------------------------------------------------------------------------
// Guard: no code path sends a shared service key or a free-text email header
// ---------------------------------------------------------------------------

const SRC_ROOT = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(full);
    return /\.(ts|js)$/.test(entry.name) ? [full] : [];
  });
}

/** Breaks of the signed-token rule, one line per file and reason. */
function proxyAuthViolations(files: Array<{ rel: string; text: string }>): string[] {
  const out: string[] = [];
  for (const { rel, text } of files) {
    if (/["']X-Mobile-User-Email["']/i.test(text)) {
      out.push(`${rel}: uses an X-Mobile-User-Email header (the email belongs inside the signed token)`);
    }
    if (/["']x-api-key["']\s*:/i.test(text)) {
      out.push(`${rel}: sends an x-api-key header`);
    }
    if (/process\.env\.MOBILE_SERVICE_API_KEY/.test(text) && rel !== path.join("lib", "envGuard.ts")) {
      out.push(`${rel}: reads MOBILE_SERVICE_API_KEY (no longer a way into SolarPro)`);
    }
  }
  return out;
}

describe("SolarPro proxy sign-in guard", () => {
  const files = sourceFiles(SRC_ROOT).map((full) => ({
    rel: path.relative(SRC_ROOT, full),
    text: fs.readFileSync(full, "utf8"),
  }));

  it("reads the proxy files it guards", () => {
    const rels = files.map((f) => f.rel);
    expect(rels).toContain(path.join("routes", "mobileClients.ts"));
    expect(rels).toContain(path.join("routes", "bugReports.ts"));
  });

  it("finds no file that sends a shared service key or a free-text email header", () => {
    expect(proxyAuthViolations(files)).toEqual([]);
  });

  it("catches a planted header and key read (mutation check)", () => {
    const planted = {
      rel: path.join("routes", "planted.ts"),
      text:
        'fetch(url, { headers: { "X-Mobile-User-Email": email, "x-api-key": key } });\n' +
        "const k = process.env.MOBILE_SERVICE_API_KEY;",
    };
    expect(proxyAuthViolations([...files, planted])).toHaveLength(3);
  });
});
