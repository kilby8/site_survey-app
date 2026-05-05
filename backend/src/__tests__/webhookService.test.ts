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

