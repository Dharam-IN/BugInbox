import pg from 'pg';

/**
 * Create the dedicated test database once per run. Everything else in the suite
 * talks to this database only, so `npm test` never touches development data.
 */
export default async function globalSetup(): Promise<void> {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgres://buginbox:buginbox@127.0.0.1:55432/buginbox_test');
  const databaseName = url.pathname.replace(/^\//, '');

  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';

  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await client.end();
  }
}
