import crypto from "crypto";
import { randomUUID } from "crypto";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function testSolarProWebhook() {
  const secret = requireEnv("SURVEY_WEBHOOK_SECRET");
  const url = requireEnv("SOLARPRO_WEBHOOK_URL");

  const timestamp = new Date().toISOString();
  const eventId = `test_evt_${Date.now()}`;

  const payload = JSON.stringify({
    event: "survey.completed",
    event_id: eventId,
    occurred_at: timestamp,
    survey_id: randomUUID(),
    status: "submitted",
    completed_at: timestamp,
  });

  const signatureHex = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const signature = `sha256=${signatureHex}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Survey-Signature": signature,
      "X-Survey-Timestamp": timestamp,
      "X-Survey-Event-Id": eventId,
    },
    body: payload,
  });

  const text = await response.text();

  console.log(`status=${response.status}`);
  console.log(text);

  if (![200, 202].includes(response.status)) {
    throw new Error(`Webhook test failed with status ${response.status}`);
  }
}

testSolarProWebhook().catch((error) => {
  console.error("❌ testSolarProWebhook failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
