/**
 * hooks/useDatabase.ts
 *
 * Initialises the local SQLite database once at app startup.
 * Returns the db instance and a ready flag.
 * All screens should wait for `ready === true` before issuing queries.
 */
import { useState, useEffect } from 'react';
import * as SQLite from 'expo-sqlite';
import * as Device from 'expo-device';
import { INIT_STATEMENTS } from '../database/schema';
import { setDb } from '../database/surveyDb';

interface UseDatabaseResult {
  ready:    boolean;
  error:    string | null;
  deviceId: string;
}

function makeDeviceId(seed?: string | null): string {
  const base = (seed || 'device').replace(/\s+/g, '-').toLowerCase();
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useDatabase(): UseDatabaseResult {
  const [ready,    setReady]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const db = await SQLite.openDatabaseAsync('site_survey.db');

        // Run all schema creation statements sequentially
        for (const sql of INIT_STATEMENTS) {
          await db.execAsync(sql);
        }

        // Register db globally so surveyDb helpers can use it
        setDb(db);

        const id = makeDeviceId(Device.modelName ?? null);

        if (!cancelled) {
          setDeviceId(id);
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  return { ready, error, deviceId };
}
