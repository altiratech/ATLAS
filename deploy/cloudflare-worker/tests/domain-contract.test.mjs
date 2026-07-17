import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath) {
  return readFile(path.join(workerRoot, relativePath), 'utf8');
}

test('canonical release binds the personal hostname and preserves both legacy domains', async () => {
  const [wrangler, worker] = await Promise.all([
    read('wrangler.toml'),
    read('src/index.ts'),
  ]);

  for (const hostname of [
    'atlas.ryanjameson.me',
    'atlas.altiratech.com',
    'farmland.altiratech.com',
  ]) {
    assert.match(
      wrangler,
      new RegExp(`\\{ pattern = "${hostname.replaceAll('.', '\\.')}", custom_domain = true \\}`),
      `missing custom domain route for ${hostname}`,
    );
  }

  assert.match(wrangler, /CANONICAL_HOST = "atlas\.ryanjameson\.me"/);
  assert.match(
    wrangler,
    /LEGACY_HOSTS = "atlas\.altiratech\.com,farmland\.altiratech\.com"/,
  );
  assert.doesNotMatch(wrangler, /^LEGACY_HOST =/m);

  assert.match(worker, /LEGACY_HOSTS\?: string;/);
  assert.match(worker, /\.split\(','\)/);
  assert.match(worker, /\.replace\(\/:\\d\+\$\/, ''\)/);
  assert.match(worker, /legacyHosts\.has\(reqHost\)/);
  assert.match(worker, /!c\.req\.path\.startsWith\('\/api\/'\)/);
});

test('operational defaults and visible canonical references use the personal hostname', async () => {
  const files = await Promise.all([
    read('scripts/check-domain-migration.sh'),
    read('scripts/smoke-release.sh'),
    read('scripts/backfill-top20.sh'),
    read('scripts/backfill-nass-bulk.mjs'),
    read('scripts/backfill-orchestrator.mjs'),
    read('scripts/ingest-industrial-eia.mjs'),
    read('src/services/ingest.ts'),
    read('README.md'),
    read('../../README.md'),
    read('../../frontend/src/app/shell.jsx'),
    read('../../frontend/src/shared/system.jsx'),
  ]);

  for (const contents of files) {
    assert.match(contents, /atlas\.ryanjameson\.me/);
  }

  const migrationCheck = files[0];
  assert.match(migrationCheck, /atlas\.altiratech\.com/);
  assert.match(migrationCheck, /farmland\.altiratech\.com/);
  assert.match(migrationCheck, /curl -sS -D - -o \/dev\/null/);
  assert.doesNotMatch(migrationCheck, /curl -sI/);
});
