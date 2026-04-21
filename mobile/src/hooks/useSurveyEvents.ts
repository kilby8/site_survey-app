/**
 * mobile/src/hooks/useSurveyEvents.ts
 *
 * React hook that subscribes to the backend SSE stream at
 * GET /api/surveys/events and calls the supplied callbacks whenever
 * a survey.created, survey.updated, or survey.deleted event arrives.
 *
 * The connection is established when the component mounts and torn down
 * on unmount (or when the token changes).  A 5-second back-off retry is
 * applied if the connection drops unexpectedly.
 *
 * Usage:
 *   useSurveyEvents(token, {
 *     onCreated: (survey) => setSurveys(prev => [survey, ...prev]),
 *     onUpdated: (survey) => setSurveys(prev => prev.map(s => s.id === survey.id ? survey : s)),
 *     onDeleted: (id)     => setSurveys(prev => prev.filter(s => s.id !== id)),
 *   });
 */

import { useEffect, useRef } from 'react';
import { API_URL } from '../api/client';
import type { Survey } from '../types';

interface SurveyEventHandlers {
  onCreated?: (survey: Survey) => void;
  onUpdated?: (survey: Survey) => void;
  onDeleted?: (id: string) => void;
}

interface SsePayload {
  type: 'survey.created' | 'survey.updated' | 'survey.deleted';
  payload: unknown;
  timestamp: string;
}

const RETRY_DELAY_MS = 5_000;

export function useSurveyEvents(
  token: string | null,
  handlers: SurveyEventHandlers,
): void {
  // Keep handlers in a ref so the effect closure always sees current values
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!token || !API_URL) return;

    let aborted = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: EventSource | null = null;

    function connect() {
      if (aborted) return;

      // EventSource doesn't support custom headers natively.
      // Pass token as a query parameter — the backend can be extended to
      // read it from ?token= as well as the Authorization header.
      const url = `${API_URL}/api/surveys/events?token=${encodeURIComponent(token!)}`;

      eventSource = new EventSource(url);

      eventSource.addEventListener('survey.created', (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data as string) as SsePayload;
          handlersRef.current.onCreated?.(parsed.payload as Survey);
        } catch { /* ignore malformed events */ }
      });

      eventSource.addEventListener('survey.updated', (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data as string) as SsePayload;
          handlersRef.current.onUpdated?.(parsed.payload as Survey);
        } catch { /* ignore malformed events */ }
      });

      eventSource.addEventListener('survey.deleted', (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data as string) as SsePayload;
          const id = (parsed.payload as { id?: string })?.id;
          if (id) handlersRef.current.onDeleted?.(id);
        } catch { /* ignore malformed events */ }
      });

      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;
        if (!aborted) {
          retryTimer = setTimeout(connect, RETRY_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      aborted = true;
      if (retryTimer) clearTimeout(retryTimer);
      eventSource?.close();
    };
  }, [token]);
}
