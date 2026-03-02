#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workerRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(workerRoot, '..', '..');
const sourceHtmlPath = path.join(repoRoot, 'frontend', 'index.html');
const outputHtmlPath = path.join(workerRoot, 'public', 'index.html');
const assetsDir = path.join(workerRoot, 'public', 'assets');

const sourceHtml = await fs.readFile(sourceHtmlPath, 'utf8');

const scriptMatch = sourceHtml.match(
  /<script\s+type="text\/babel">([\s\S]*?)<\/script>/i,
);

if (!scriptMatch) {
  throw new Error('Could not find <script type="text/babel"> block in frontend/index.html');
}

const jsxCode = scriptMatch[1];
const transformed = await esbuild.transform(jsxCode, {
  loader: 'jsx',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  target: 'es2018',
  minify: true,
});

const appHash = createHash('sha256').update(transformed.code).digest('hex').slice(0, 12);
const appFileName = `app.${appHash}.js`;
const appOutputPath = path.join(assetsDir, appFileName);

await fs.mkdir(assetsDir, { recursive: true });
const assetFiles = await fs.readdir(assetsDir);
for (const fileName of assetFiles) {
  if (/^app\.[a-f0-9]{12}\.js$/i.test(fileName) && fileName !== appFileName) {
    await fs.unlink(path.join(assetsDir, fileName));
  }
}

await fs.writeFile(appOutputPath, `${transformed.code}\n`, 'utf8');

const withoutBabelLib = sourceHtml.replace(
  /\s*<script\s+src="https:\/\/unpkg\.com\/@babel\/standalone\/babel\.min\.js"><\/script>\s*/i,
  '\n',
);

const compiledHtml = withoutBabelLib.replace(
  /<script\s+type="text\/babel">[\s\S]*?<\/script>/i,
  `<script src="/assets/${appFileName}" defer></script>`,
);

await fs.writeFile(outputHtmlPath, compiledHtml, 'utf8');

const inSizeKb = (Buffer.byteLength(sourceHtml) / 1024).toFixed(1);
const outSizeKb = (Buffer.byteLength(compiledHtml) / 1024).toFixed(1);
const appSizeKb = (Buffer.byteLength(transformed.code) / 1024).toFixed(1);
console.log(`Built frontend bundle: ${sourceHtmlPath} -> ${outputHtmlPath}`);
console.log(`HTML size: ${inSizeKb} KB -> ${outSizeKb} KB`);
console.log(`JS asset: /assets/${appFileName} (${appSizeKb} KB)`);
