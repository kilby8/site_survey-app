import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'surveys.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS surveys (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export interface SurveyRow {
  id: string;
  data: string;
  created_at: string;
  updated_at: string;
}

export function getAllSurveys(): SurveyRow[] {
  const stmt = db.prepare('SELECT * FROM surveys ORDER BY updated_at DESC');
  return stmt.all() as SurveyRow[];
}

export function getSurveyById(id: string): SurveyRow | undefined {
  const stmt = db.prepare('SELECT * FROM surveys WHERE id = ?');
  return stmt.get(id) as SurveyRow | undefined;
}

export function insertSurvey(id: string, data: string, now: string): void {
  const stmt = db.prepare(
    'INSERT INTO surveys (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)'
  );
  stmt.run(id, data, now, now);
}

export function updateSurvey(id: string, data: string, now: string): boolean {
  const stmt = db.prepare(
    'UPDATE surveys SET data = ?, updated_at = ? WHERE id = ?'
  );
  const result = stmt.run(data, now, id);
  return result.changes > 0;
}

export default db;
