#!/usr/bin/env node

/**
 * Simple API latency smoke test.
 *
 * Usage examples:
 *   node scripts/latency-smoke.js
 *   API_URL=http://localhost:3001 API_BEARER_TOKEN=... node scripts/latency-smoke.js
 */

const API_URL = (process.env.API_URL || "http://localhost:3001").replace(/\/$/, "");
const TOKEN = process.env.API_BEARER_TOKEN || "";
const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS || "15", 10);
const WARMUP = Number.parseInt(process.env.BENCH_WARMUP || "3", 10);

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  const safeIdx = Math.max(0, Math.min(sorted.length - 1, idx));
  return sorted[safeIdx];
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((acc, n) => acc + n, 0);
  return {
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
    avg: values.length > 0 ? sum / values.length : 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
  };
}

async function timeRequest(url, headers) {
  const started = performance.now();
  const res = await fetch(url, { headers });
  const ended = performance.now();
  return {
    status: res.status,
    durationMs: ended - started,
  };
}

async function benchmarkEndpoint(name, path, needsAuth) {
  const url = `${API_URL}${path}`;
  const headers = {};

  if (needsAuth && TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  }

  if (needsAuth && !TOKEN) {
    return {
      name,
      path,
      skipped: true,
      reason: "Missing API_BEARER_TOKEN",
    };
  }

  // Warmup requests (ignored)
  for (let i = 0; i < WARMUP; i += 1) {
    await timeRequest(url, headers);
  }

  const durations = [];
  const statuses = {};

  for (let i = 0; i < ITERATIONS; i += 1) {
    const { status, durationMs } = await timeRequest(url, headers);
    durations.push(durationMs);
    statuses[status] = (statuses[status] || 0) + 1;
  }

  return {
    name,
    path,
    skipped: false,
    count: durations.length,
    statuses,
    ...stats(durations),
  };
}

async function main() {
  const endpoints = [
    { name: "Health", path: "/api/health", needsAuth: false },
    { name: "Surveys list", path: "/api/surveys?limit=50&offset=0&include_total=false", needsAuth: true },
    { name: "Admin surveys", path: "/api/surveys/admin/surveys?limit=50&offset=0&include_total=false", needsAuth: true },
  ];

  const results = [];
  for (const endpoint of endpoints) {
    try {
      const result = await benchmarkEndpoint(endpoint.name, endpoint.path, endpoint.needsAuth);
      results.push(result);
    } catch (error) {
      results.push({
        name: endpoint.name,
        path: endpoint.path,
        skipped: true,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log("API Latency Smoke Test");
  console.log(`Base URL: ${API_URL}`);
  console.log(`Warmup: ${WARMUP} | Iterations: ${ITERATIONS}`);
  console.log("");

  for (const result of results) {
    if (result.skipped) {
      console.log(`${result.name} (${result.path})`);
      console.log(`  SKIPPED: ${result.reason}`);
      console.log("");
      continue;
    }

    console.log(`${result.name} (${result.path})`);
    console.log(`  count=${result.count}`);
    console.log(`  status_counts=${JSON.stringify(result.statuses)}`);
    console.log(`  min=${result.min.toFixed(1)}ms avg=${result.avg.toFixed(1)}ms max=${result.max.toFixed(1)}ms`);
    console.log(`  p50=${result.p50.toFixed(1)}ms p95=${result.p95.toFixed(1)}ms`);
    console.log("");
  }
}

main().catch((error) => {
  console.error("Latency smoke test failed:", error);
  process.exit(1);
});
