// Test setup — point to test database environment
process.env.DB_HOST     = 'localhost';
process.env.DB_PORT     = '5432';
process.env.DB_NAME     = 'site_survey';
process.env.DB_USER     = 'survey_user';
process.env.DB_PASSWORD = 'survey_pass_2024';
process.env.DB_SSL      = 'false';
process.env.NODE_ENV    = 'test';
process.env.SOLARPRO_HANDOFF_SECRET = 'test-handoff-secret';

// Provide a DATABASE_URL so getWebsitePool() (sqliteAuthStore) can connect
// in tests. The 'website' pool falls back to the same local Postgres instance.
process.env.DATABASE_URL =
  'postgresql://survey_user:survey_pass_2024@localhost:5432/site_survey';

