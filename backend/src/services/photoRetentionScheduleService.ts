import { runPhotoRetentionPurge } from "../scripts/photoRetentionPurge";

type TimeParts = {
  dateKey: string;
  hour: number;
  minute: number;
};

const CENTRAL_TIME_ZONE = "America/Chicago";
const SCHEDULE_HOUR = 1;
let workerHandle: NodeJS.Timeout | null = null;
let lastRunDateKey: string | null = null;
let runInProgress = false;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isScheduleEnabled(): boolean {
  const raw = (process.env.PHOTO_RETENTION_SCHEDULE_ENABLED || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "no";
}

function getCentralTimeParts(date = new Date()): TimeParts {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CENTRAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const hour = Number.parseInt(timeParts.find((part) => part.type === "hour")?.value || "0", 10);
  const minute = Number.parseInt(timeParts.find((part) => part.type === "minute")?.value || "0", 10);

  return {
    dateKey: dateParts,
    hour,
    minute,
  };
}

async function runScheduledPurge(): Promise<void> {
  if (runInProgress) return;

  const now = getCentralTimeParts();
  const runWindowMinutes = parsePositiveInteger(process.env.PHOTO_RETENTION_SCHEDULE_WINDOW_MINUTES, 10);
  const inRunWindow = now.hour === SCHEDULE_HOUR && now.minute < runWindowMinutes;
  if (!inRunWindow || lastRunDateKey === now.dateKey) return;

  runInProgress = true;
  lastRunDateKey = now.dateKey;

  const stageALimit = parsePositiveInteger(process.env.PHOTO_RETENTION_STAGE_A_LIMIT, 100);
  const stageBLimit = parsePositiveInteger(process.env.PHOTO_RETENTION_STAGE_B_LIMIT, 100);
  const holdDaysA = parsePositiveInteger(process.env.PHOTO_RETENTION_STAGE_A_HOLD_DAYS, 7);
  const holdDaysB = parsePositiveInteger(process.env.PHOTO_RETENTION_STAGE_B_HOLD_DAYS, 30);

  console.info(
    JSON.stringify({
      type: "photo_retention_schedule_start",
      timezone: CENTRAL_TIME_ZONE,
      date_key: now.dateKey,
      run_window_minutes: runWindowMinutes,
    }),
  );

  try {
    const stageAResult = await runPhotoRetentionPurge({
      stage: "a",
      apply: true,
      limit: stageALimit,
      holdDaysA,
      holdDaysB,
    });

    const stageBResult = await runPhotoRetentionPurge({
      stage: "b",
      apply: true,
      limit: stageBLimit,
      holdDaysA,
      holdDaysB,
    });

    console.info(
      JSON.stringify({
        type: "photo_retention_schedule_complete",
        timezone: CENTRAL_TIME_ZONE,
        date_key: now.dateKey,
        stage_a: stageAResult,
        stage_b: stageBResult,
      }),
    );
  } catch (error) {
    console.error("Scheduled photo retention purge failed:", error);
  } finally {
    runInProgress = false;
  }
}

export function startPhotoRetentionScheduleWorker(intervalMs = 60_000): void {
  if (workerHandle || !isScheduleEnabled()) return;

  workerHandle = setInterval(() => {
    runScheduledPurge().catch((error) => {
      console.error("Photo retention schedule tick failed:", error);
    });
  }, intervalMs);

  runScheduledPurge().catch((error) => {
    console.error("Photo retention schedule startup tick failed:", error);
  });
}

export function stopPhotoRetentionScheduleWorker(): void {
  if (!workerHandle) return;
  clearInterval(workerHandle);
  workerHandle = null;
}

