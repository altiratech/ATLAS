import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath) {
  return readFile(path.join(workerRoot, relativePath), 'utf8');
}

test('compatibility release binds the personal hostname without changing canonical routing', async () => {
  const wrangler = await read('wrangler.toml');

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

  assert.match(wrangler, /CANONICAL_HOST = "atlas\.altiratech\.com"/);
  assert.match(wrangler, /LEGACY_HOST = "farmland\.altiratech\.com"/);
});
