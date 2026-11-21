#!/usr/bin/env node
/**
 * Build the committed better-sqlite3 12.x fixture database.
 *
 * Run this only on a checkout whose locked better-sqlite3 is 12.x
 * (main as of #177 / v0.3.5 locks 12.11.1). The script exits if the
 * resolved package is not 12.x, so it cannot silently rewrite the
 * fixture with 13.
 *
 *   pnpm install --frozen-lockfile
 *   pnpm run build:contracts && pnpm run build:main
 *   node scripts/generate-better-sqlite3-v12-fixture.mjs
 *
 * The file is created through ConnectionManager.initialize() (WAL,
 * foreign keys, applySchema) and OkrStore.createObjective / setProgress,
 * then checkpointed to a single .db (journal_mode=DELETE) so it can be
 * committed without -wal/-shm sidecars.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConnectionManager } from '../app/main/dist/persistence/connection-manager.js';
import { OkrStore } from '../app/main/dist/persistence/okr-store/okr-store.js';
import {
  LATEST_SCHEMA_VERSION,
  getSchemaVersion,
} from '../app/main/dist/persistence/okr-store/schema.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repoRoot, 'app/main/package.json'));
const outDir = join(repoRoot, 'tests/fixtures/better-sqlite3-v12');
const dbName = 'clarityokr-from-12.11.1.db';
const sqliteVersion = require('better-sqlite3/package.json').version;

if (!sqliteVersion.startsWith('12.')) {
  console.error(
    `Refusing to generate the v12 fixture with better-sqlite3@${sqliteVersion}. ` +
      'Check out main (12.11.1) and rerun.',
  );
  process.exit(1);
}

export const FIXTURE_IDS = {
  objectiveId: '11111111-1111-4111-8111-111111111111',
  krAId: '22222222-2222-4222-8222-222222222222',
  krBId: '33333333-3333-4333-8333-333333333333',
};

const TITLE = 'better-sqlite3 12 fixture';
const PERIOD = '2026-Q4';
const KR_A = { statement: 'Existing KR A', successMetric: 'metric-a' };
const KR_B = { statement: 'Existing KR B' };

mkdirSync(outDir, { recursive: true });
const tmpDir = join(outDir, '.generate-tmp');
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
const tmpDb = join(tmpDir, dbName);

let clock = Date.UTC(2026, 9, 11, 12, 0, 0);
const manager = new ConnectionManager({ dbPath: tmpDb });
manager.initialize();
const store = new OkrStore(manager.getDb(), () => new Date((clock += 1000)));
store.createObjective({
  id: FIXTURE_IDS.objectiveId,
  title: TITLE,
  period: PERIOD,
  keyResults: [
    { id: FIXTURE_IDS.krAId, statement: KR_A.statement, successMetric: KR_A.successMetric },
    { id: FIXTURE_IDS.krBId, statement: KR_B.statement },
  ],
});
store.setProgress(FIXTURE_IDS.krAId, { value: 40, status: 'in_progress' });

const db = manager.getDb();
const schemaVersion = getSchemaVersion(db);
if (schemaVersion !== LATEST_SCHEMA_VERSION) {
  throw new Error(`expected schema version ${LATEST_SCHEMA_VERSION}, got ${schemaVersion}`);
}
db.pragma('wal_checkpoint(TRUNCATE)');
db.pragma('journal_mode = DELETE');
manager.close();

for (const extra of [`${tmpDb}-wal`, `${tmpDb}-shm`]) {
  if (existsSync(extra)) rmSync(extra);
}

const outDb = join(outDir, dbName);
cpSync(tmpDb, outDb);
rmSync(tmpDir, { recursive: true, force: true });

const manifest = {
  generatedWith: `better-sqlite3 ${sqliteVersion}`,
  schemaVersion,
  title: TITLE,
  period: PERIOD,
  ...FIXTURE_IDS,
  keyResults: [
    {
      id: FIXTURE_IDS.krAId,
      statement: KR_A.statement,
      successMetric: KR_A.successMetric,
      progress: 40,
      status: 'in_progress',
    },
    {
      id: FIXTURE_IDS.krBId,
      statement: KR_B.statement,
      successMetric: null,
      progress: null,
      status: 'not_started',
    },
  ],
  notes:
    'Generated via scripts/generate-better-sqlite3-v12-fixture.mjs on a 12.x checkout. See README.md.',
};
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Wrote ${outDb} and manifest.json (better-sqlite3@${sqliteVersion}, schema v${schemaVersion})`,
);
