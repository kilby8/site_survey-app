type QueryResult = { rows: Array<Record<string, unknown>> };

describe("webhookService non-retriable delivery behavior", () => {
  const originalFetch = global.fetch;
  const originalWebhookUrl = process.env.SOLARPRO_WEBHOOK_URL;
  const originalWebhookSecret = process.env.SURVEY_WEBHOOK_SECRET;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    // These tests intentionally exercise failure/retry paths that log warnings.
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.resetModules();
    jest.clearAllMocks();
    global.fetch = originalFetch;
    process.env.SOLARPRO_WEBHOOK_URL = originalWebhookUrl;
    process.env.SURVEY_WEBHOOK_SECRET = originalWebhookSecret;
  });

  async function runCase(status: number): Promise<{ updates: string[]; queryMock: jest.Mock }> {
    process.env.SOLARPRO_WEBHOOK_URL = "https://receiver.example.com/api/webhooks/survey-complete";
    process.env.SURVEY_WEBHOOK_SECRET = "whsec_test";

    const updates: string[] = [];
    const queryMock = jest.fn(async (sql: string): Promise<QueryResult> => {
      const text = sql.replace(/\s+/g, " ").trim();

      if (text.includes("CREATE TABLE IF NOT EXISTS webhook_deliveries")) {
        return { rows: [] };
      }

      if (text.includes("FROM webhook_deliveries") && text.includes("WHERE status = 'pending'")) {
        return {
          rows: [
            {
              id: "delivery-1",
              survey_id: "survey-1",
              event_type: "survey.completed",
              event_id: "event-1",
              payload: JSON.stringify({
                event: "survey.completed",
                event_id: "event-1",
                occurred_at: "2026-05-02T00:00:00.000Z",
                survey_id: "survey-1",
                status: "submitted",
                completed_at: "2026-05-02T00:00:01.000Z",
              }),
              status: "pending",
              attempt_count: 0,
              next_attempt_at: new Date().toISOString(),
              last_error: null,
            },
          ],
        };
      }

      if (text.includes("UPDATE webhook_deliveries") && text.includes("SET status = 'failed'")) {
        updates.push("failed");
        return { rows: [] };
      }

      if (text.includes("UPDATE webhook_deliveries") && text.includes("SET status = 'pending'")) {
        updates.push("pending");
        return { rows: [] };
      }

      if (text.includes("UPDATE webhook_deliveries") && text.includes("SET status = 'delivered'")) {
        updates.push("delivered");
        return { rows: [] };
      }

      if (text.includes("CREATE TABLE IF NOT EXISTS deletion_queue")) {
        return { rows: [] };
      }

      if (text.includes("FROM deletion_queue")) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    jest.doMock("../database", () => ({
      pool: { query: queryMock },
    }));

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status }) as unknown as typeof fetch;

    const { processWebhookQueue } = await import("../services/webhookService");
    await processWebhookQueue(10);

    return { updates, queryMock };
  }

  it.each([400, 401, 501])("marks delivery failed without retry for HTTP %s", async (statusCode) => {
    const { updates } = await runCase(statusCode);

    expect(updates).toContain("failed");
    expect(updates).not.toContain("pending");
  });

  it("keeps retry behavior for retriable HTTP status", async () => {
    const { updates } = await runCase(500);

    expect(updates).toContain("pending");
    expect(updates).not.toContain("failed");
  });
});

// ---------------------------------------------------------------------------
// F-06: Ownership routing — solarpro_* fields must be in webhook payload
// ---------------------------------------------------------------------------
describe("enqueueSurveyCompleteWebhook — F-06 ownership fields", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("includes solarpro_user_id, solarpro_project_id, solarpro_email in payload", async () => {
    let insertedPayload: Record<string, unknown> | null = null;

    const queryMock = jest.fn(async (sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> => {
      const text = sql.replace(/\s+/g, " ").trim();
      if (text.includes("CREATE TABLE IF NOT EXISTS webhook_deliveries")) {
        return { rows: [] };
      }
      if (text.includes("INSERT INTO webhook_deliveries")) {
        // params: [survey_id, event_type, event_id, payload_json]
        const payloadJson = (params as string[])?.[3];
        if (payloadJson) {
          insertedPayload = JSON.parse(payloadJson) as Record<string, unknown>;
        }
        return { rows: [] };
      }
      return { rows: [] };
    });

    jest.doMock("../database", () => ({
      pool: { query: queryMock },
    }));

    const { enqueueSurveyCompleteWebhook } = await import("../services/webhookService");

    await enqueueSurveyCompleteWebhook({
      survey_id: "survey-abc",
      status: "submitted",
      completed_at: "2026-05-02T00:00:00.000Z",
      solarpro_user_id: "user-uuid-123",
      solarpro_project_id: "project-uuid-456",
      solarpro_email: "ray@example.com",
      inspector_name: "Ray Test",
    });

    expect(insertedPayload).not.toBeNull();
    expect(insertedPayload!.solarpro_user_id).toBe("user-uuid-123");
    expect(insertedPayload!.solarpro_project_id).toBe("project-uuid-456");
    expect(insertedPayload!.solarpro_email).toBe("ray@example.com");
    expect(insertedPayload!.inspector_name).toBe("Ray Test");
    expect(insertedPayload!.survey_id).toBe("survey-abc");
    expect(insertedPayload!.event).toBe("survey.completed");
  });

  it("sends null for missing ownership fields (no fallback to undefined)", async () => {
    let insertedPayload: Record<string, unknown> | null = null;

    const queryMock = jest.fn(async (sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> => {
      const text = sql.replace(/\s+/g, " ").trim();
      if (text.includes("CREATE TABLE IF NOT EXISTS webhook_deliveries")) {
        return { rows: [] };
      }
      if (text.includes("INSERT INTO webhook_deliveries")) {
        const payloadJson = (params as string[])?.[3];
        if (payloadJson) {
          insertedPayload = JSON.parse(payloadJson) as Record<string, unknown>;
        }
        return { rows: [] };
      }
      return { rows: [] };
    });

    jest.doMock("../database", () => ({
      pool: { query: queryMock },
    }));

    const { enqueueSurveyCompleteWebhook } = await import("../services/webhookService");

    await enqueueSurveyCompleteWebhook({
      survey_id: "survey-xyz",
      status: "submitted",
      completed_at: "2026-05-02T00:00:00.000Z",
      // No solarpro_* fields — simulates standalone survey with no handoff JWT
    });

    expect(insertedPayload).not.toBeNull();
    // Fields must be present (null) — not absent — so SolarPro ownerResolver
    // can distinguish "sent null" from "field missing entirely"
    expect(insertedPayload).toHaveProperty("solarpro_user_id", null);
    expect(insertedPayload).toHaveProperty("solarpro_project_id", null);
    expect(insertedPayload).toHaveProperty("solarpro_email", null);
  });
});

