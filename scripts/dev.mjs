import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import 'dotenv/config';
import EmbeddedPostgres from 'embedded-postgres';
let pg;
const dir = path.resolve('data/postgres');
if (!process.env.DATABASE_URL || process.env.EMBEDDED_POSTGRES === '1') {
  let password = process.env.LOCAL_PG_PASSWORD || crypto.randomBytes(24).toString('hex');
  // Keep the private database on its configured port, separate from the HTTP preview.
  const port = process.env.DATABASE_URL
    ? Number(new URL(process.env.DATABASE_URL).port || 5432)
    : 5434;
  if (port === Number(process.env.PORT || 5433))
    throw new Error(
      'The embedded database and web preview require different ports. Set the database URL port to 5434 and PORT to 5433.',
    );
  if (!process.env.DATABASE_URL) {
    const url = `postgresql://meridian:${password}@127.0.0.1:${port}/meridian`;
    fs.appendFileSync(
      '.env',
      `\nEMBEDDED_POSTGRES=1\nLOCAL_PG_PASSWORD=${password}\nDATABASE_URL=${url}\n`,
      { mode: 0o600 },
    );
    process.env.DATABASE_URL = url;
  }
  pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'meridian',
    password,
    port,
    persistent: true,
    authMethod: 'scram-sha-256',
    autoRehydrateSymlinks: true,
    postgresFlags: [
      '-c',
      'listen_addresses=127.0.0.1',
      '-c',
      'shared_buffers=16MB',
      '-c',
      'max_wal_size=96MB',
      '-c',
      'min_wal_size=32MB',
    ],
    onLog: () => {},
    onError: (e) => console.error(String(e)),
  });
  if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase('meridian');
  } catch (e) {
    if (!String(e).includes('already exists')) throw e;
  }
}
console.log('PostgreSQL is ready. Preparing the newsroom…');
const prisma = path.resolve('node_modules/.bin/prisma');
execFileSync(prisma, ['generate'], { stdio: 'inherit', env: process.env });
execFileSync(prisma, ['migrate', 'deploy'], { stdio: 'inherit', env: process.env });
const { seed } = await import('../prisma/seed.mjs');
await seed();
const { start } = await import('../server/index.mjs');
const server = await start();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close();
  const { db } = await import('../server/db.mjs');
  await db.$disconnect();
  if (pg) await pg.stop();
  process.exit();
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
