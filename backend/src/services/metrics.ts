type CounterName =
  | "api_requests_total"
  | "survey_sync_success_total"
  | "survey_sync_error_total"
  | "webhook_enqueued_total"
  | "webhook_delivered_total"
  | "webhook_failed_total"
  | "handoff_replay_total";

type TimerName = "http_request_duration_ms" | "survey_sync_duration_ms";

interface TimerStats {
  count: number;
  total_ms: number;
  max_ms: number;
}

const startedAt = Date.now();

const counters: Record<CounterName, number> = {
  api_requests_total: 0,
  survey_sync_success_total: 0,
  survey_sync_error_total: 0,
  webhook_enqueued_total: 0,
  webhook_delivered_total: 0,
  webhook_failed_total: 0,
  handoff_replay_total: 0,
};

const timers: Record<TimerName, TimerStats> = {
  http_request_duration_ms: { count: 0, total_ms: 0, max_ms: 0 },
  survey_sync_duration_ms: { count: 0, total_ms: 0, max_ms: 0 },
};

export function incrementMetric(name: CounterName, by = 1): void {
  counters[name] += by;
}

export function recordTiming(name: TimerName, durationMs: number): void {
  const safeMs = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
  const timer = timers[name];
  timer.count += 1;
  timer.total_ms += safeMs;
  if (safeMs > timer.max_ms) {
    timer.max_ms = safeMs;
  }
}

export function getMetricsSnapshot() {
  return {
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    counters: { ...counters },
    timings: {
      http_request_duration_ms: {
        ...timers.http_request_duration_ms,
        avg_ms:
          timers.http_request_duration_ms.count > 0
            ? timers.http_request_duration_ms.total_ms /
              timers.http_request_duration_ms.count
            : 0,
      },
      survey_sync_duration_ms: {
        ...timers.survey_sync_duration_ms,
        avg_ms:
          timers.survey_sync_duration_ms.count > 0
            ? timers.survey_sync_duration_ms.total_ms /
              timers.survey_sync_duration_ms.count
            : 0,
      },
    },
  };
}
