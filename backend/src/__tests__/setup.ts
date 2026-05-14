// Test setup — point to test database environment.
// Prefer externally supplied URLs/host settings so CI or local shells can target
// non-local databases (e.g. Raymond website DB for auth validation).
const LOCAL_DB_URL =
  'postgresql://survey_user:survey_pass_2024@localhost:5432/site_survey';

if (!process.env.DATABASE_URL && !process.env.APP_DATABASE_URL && !process.env.DB_HOST) {
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '5432';
  process.env.DB_NAME = 'site_survey';
  process.env.DB_USER = 'survey_user';
  process.env.DB_PASSWORD = 'survey_pass_2024';
  process.env.DB_SSL = 'false';
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.APP_DATABASE_URL || LOCAL_DB_URL;
}

process.env.NODE_ENV = 'test';
if (!process.env.SOLARPRO_HANDOFF_SECRET) {
  process.env.SOLARPRO_HANDOFF_SECRET = 'test-handoff-secret';
}

