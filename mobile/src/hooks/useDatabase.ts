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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INIT_STATEMENTS, PHOTOS_OPTIONAL_COLUMNS, SURVEYS_OPTIONAL_COLUMNS } from '../database/schema';
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

const DEVICE_ID_KEY = 'site-survey.device-id.v1';

/** One id per install, kept across launches so the server sees a stable device. */
async function loadDeviceId(seed?: string | null): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (saved) return saved;
    const id = makeDeviceId(seed);
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return makeDeviceId(seed);
  }
}

async function ensureColumns(
  db: SQLite.SQLiteDatabase,
  table: 'surveys' | 'survey_photos',
  wanted: ReadonlyArray<{ name: string; sqlType: string }>,
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  const existing = new Set(columns.map((column) => column.name));

  for (const column of wanted) {
    if (existing.has(column.name)) continue;

    try {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.sqlType};`);
      existing.add(column.name);
    } catch (migrationError) {
      const message =
        migrationError instanceof Error
          ? migrationError.message
          : String(migrationError);

      if (/duplicate column name/i.test(message)) {
        existing.add(column.name);
        continue;
      }

      throw new Error(`SQLite migration failed for ${table}.${column.name}: ${message}`);
    }
  }
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
          try {
            await db.execAsync(sql);
          } catch (statementError) {
            const message =
              statementError instanceof Error
                ? statementError.message
                : String(statementError);

            // Ignore duplicate-column migration races on existing installs.
            if (/duplicate column name/i.test(message)) {
              continue;
            }

            throw new Error(
              `SQLite init failed for statement: ${sql.trim().slice(0, 120)} :: ${message}`,
            );
          }
        }

        await ensureColumns(db, 'surveys', SURVEYS_OPTIONAL_COLUMNS);
        await ensureColumns(db, 'survey_photos', PHOTOS_OPTIONAL_COLUMNS);

        // Register db globally so surveyDb helpers can use it
        setDb(db);

        const id = await loadDeviceId(Device.modelName ?? null);

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
