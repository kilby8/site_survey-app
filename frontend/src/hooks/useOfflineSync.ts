import { useState, useEffect, useCallback } from 'react';
import type { Survey } from '../types/survey';
import { createSurvey, updateSurvey } from '../api/surveyApi';

const OFFLINE_QUEUE_KEY = 'site_survey_offline_queue';

interface QueuedSurvey {
  survey: Survey;
  action: 'create' | 'update';
  queuedAt: string;
}

function loadQueue(): QueuedSurvey[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedSurvey[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedSurvey[]): void {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueLength, setQueueLength] = useState(() => loadQueue().length);
  const [syncing, setSyncing] = useState(false);

  const syncQueue = useCallback(async () => {
    const queue = loadQueue();
    if (queue.length === 0) return;

    setSyncing(true);
    const remaining: QueuedSurvey[] = [];

    for (const item of queue) {
      try {
        if (item.action === 'create') {
          await createSurvey(item.survey);
        } else {
          await updateSurvey(item.survey.id, item.survey);
        }
      } catch {
        remaining.push(item);
      }
    }

    saveQueue(remaining);
    setQueueLength(remaining.length);
    setSyncing(false);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncQueue]);

  const enqueue = useCallback((survey: Survey, action: 'create' | 'update') => {
    const queue = loadQueue();
    const existing = queue.findIndex(q => q.survey.id === survey.id);
    const entry: QueuedSurvey = { survey, action, queuedAt: new Date().toISOString() };
    if (existing >= 0) {
      queue[existing] = entry;
    } else {
      queue.push(entry);
    }
    saveQueue(queue);
    setQueueLength(queue.length);
  }, []);

  return { isOnline, queueLength, syncing, enqueue, syncQueue };
}
