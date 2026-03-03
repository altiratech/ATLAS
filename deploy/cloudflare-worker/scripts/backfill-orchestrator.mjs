#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BASE_URL = 'https://atlas.altiratech.com';
const DEFAULT_STATES = [
  'IA', 'IL', 'IN', 'NE', 'KS', 'MN', 'OH', 'WI', 'MO', 'SD',
  'ND', 'TX', 'CA', 'WA', 'OR', 'ID', 'MT', 'CO', 'MI', 'PA',
];
const BULK_SCRIPT_PATH = fileURLToPath(new URL('./backfill-nass-bulk.mjs', import.meta.url));

function parseArgs(argv) {
  const opts = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=', 2);
    const key = rawKey.slice(2);
    if (inlineValue != null) {
      opts[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      opts[key] = 'true';
      continue;
    }
    opts[key] = next;
    i += 1;
  }
  return opts;
}

function parseBool(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseStates(value) {
  const tokens = (value || DEFAULT_STATES.join(','))
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
  const states = Array.from(new Set(tokens));
  for (const state of states) {
    if (!/^[A-Z]{2}$/.test(state)) {
      throw new Error(`Invalid state token: ${state}`);
    }
  }
  return states;
}

function clampInt(value, fallback, min = 1, max = Number.POSITIVE_INFINITY) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function truncate(text, limit = 2000) {
  if (!text) return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}…`;
}

async function requestJson(url, { method = 'GET', headers = {}, body, timeoutMs = 120_000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${method} ${url}: ${truncate(raw, 3000)}`);
    }
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Timed out after ${timeoutMs}ms: ${method} ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const ingestAdminToken = process.env.ATLAS_INGEST_ADMIN_TOKEN?.trim();
  const bearerToken = process.env.ATLAS_BEARER_TOKEN?.trim();
  if (!ingestAdminToken && !bearerToken) {
    throw new Error('Set ATLAS_INGEST_ADMIN_TOKEN or ATLAS_BEARER_TOKEN before running orchestrator.');
  }
  if (ingestAdminToken) {
    headers['X-Atlas-Ingest-Token'] = ingestAdminToken;
  }
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const accessClientId = process.env.ATLAS_CF_ACCESS_CLIENT_ID?.trim() ?? '';
  const accessClientSecret = process.env.ATLAS_CF_ACCESS_CLIENT_SECRET?.trim() ?? '';
  if ((accessClientId && !accessClientSecret) || (!accessClientId && accessClientSecret)) {
    throw new Error('Set both ATLAS_CF_ACCESS_CLIENT_ID and ATLAS_CF_ACCESS_CLIENT_SECRET, or neither.');
  }
  if (accessClientId && accessClientSecret) {
    headers['CF-Access-Client-Id'] = accessClientId;
    headers['CF-Access-Client-Secret'] = accessClientSecret;
  }
  return headers;
}

function keyForUnit(source, year, state) {
  return `${source}::${year}::${state}`;
}

async function loadProgressRows(baseUrl, headers, source, startYear, endYear, states, timeoutMs) {
  const query = new URLSearchParams({
    source,
    start_year: String(startYear),
    end_year: String(endYear),
    states: states.join(','),
    limit: '5000',
  });
  const payload = await requestJson(`${baseUrl}/api/v1/ingest/progress?${query.toString()}`, {
    method: 'GET',
    headers,
    timeoutMs,
  });
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const byKey = new Map();
  for (const row of rows) {
    byKey.set(keyForUnit(row.source, row.year, row.state), row);
  }
  return byKey;
}

async function upsertProgress(baseUrl, headers, payload, timeoutMs) {
  return requestJson(`${baseUrl}/api/v1/ingest/progress`, {
    method: 'POST',
    headers,
    body: payload,
    timeoutMs,
  });
}

async function runBulkUnit({
  baseUrl,
  year,
  state,
  source,
  batchSize,
  includeCrops,
  includeEconomics,
  requestTimeoutMs,
}) {
  const summaryPath = join(tmpdir(), `atlas-bulk-${state}-${year}-${Date.now()}.json`);
  const args = [
    BULK_SCRIPT_PATH,
    '--start-year',
    String(year),
    '--end-year',
    String(year),
    '--states',
    state,
    '--batch-size',
    String(batchSize),
    '--run-macro',
    'false',
    '--include-crops',
    String(includeCrops),
    '--include-economics',
    String(includeEconomics),
    '--base-url',
    baseUrl,
    '--source',
    source,
    '--request-timeout-ms',
    String(requestTimeoutMs),
    '--summary-json',
    summaryPath,
  ];

  const child = spawn(process.execPath, args, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  if (exitCode !== 0) {
    await rm(summaryPath, { force: true });
    throw new Error(
      `Bulk unit failed for ${state}-${year} (exit ${exitCode}). stderr=${truncate(stderr, 3000)} stdout_tail=${truncate(stdout.slice(-3000), 3000)}`,
    );
  }

  let summary;
  try {
    summary = JSON.parse(await readFile(summaryPath, 'utf8'));
  } finally {
    await rm(summaryPath, { force: true });
  }
  return summary;
}

async function maybeRunMacro({
  enabled,
  baseUrl,
  headers,
  startYear,
  endYear,
  source,
  maxRetries,
  timeoutMs,
}) {
  if (!enabled) {
    return { skipped: true, status: 'skipped' };
  }
  const macroSource = `${source}-MACRO`;
  const state = 'US';
  const year = endYear;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    await upsertProgress(
      baseUrl,
      headers,
      {
        source: macroSource,
        year,
        state,
        status: 'running',
        increment_attempt: true,
        meta: { phase: 'macro', attempt, start_year: startYear, end_year: endYear },
      },
      timeoutMs,
    );
    try {
      const url =
        `${baseUrl}/api/v1/ingest` +
        `?start_year=${startYear}` +
        `&end_year=${endYear}` +
        '&include_nass=0&include_fred=1&include_ag_index=1';
      const result = await requestJson(url, { method: 'POST', headers, timeoutMs });
      const inserted =
        Number(result?.fred?.inserted ?? 0) + Number(result?.ag_index?.inserted ?? 0);
      await upsertProgress(
        baseUrl,
        headers,
        {
          source: macroSource,
          year,
          state,
          status: 'success',
          inserted,
          rows_total: inserted,
          skipped: 0,
          meta: { phase: 'macro', attempt, response: result },
        },
        timeoutMs,
      );
      return { skipped: false, status: 'success', attempt, result };
    } catch (error) {
      const message = truncate(error?.message || String(error), 2000);
      await upsertProgress(
        baseUrl,
        headers,
        {
          source: macroSource,
          year,
          state,
          status: 'failed',
          last_error: message,
          meta: { phase: 'macro', attempt, start_year: startYear, end_year: endYear },
        },
        timeoutMs,
      );
      if (attempt === maxRetries) {
        return { skipped: false, status: 'failed', attempt, error: message };
      }
    }
  }
  return { skipped: false, status: 'failed', attempt: maxRetries, error: 'macro retries exhausted' };
}

function renderSummaryMarkdown(report) {
  const lines = [];
  lines.push('## Atlas Backfill Orchestrator Summary');
  lines.push('');
  lines.push(`- Base URL: \`${report.baseUrl}\``);
  lines.push(`- Source: \`${report.source}\``);
  lines.push(`- Year range: \`${report.startYear}-${report.endYear}\``);
  lines.push(`- States: \`${report.states.join(',')}\``);
  lines.push(`- Max retries per unit: \`${report.maxRetries}\``);
  lines.push(`- Resume mode: \`${report.resumeMode}\``);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | ---: |');
  lines.push(`| Planned units | ${report.totalUnits} |`);
  lines.push(`| Successful units | ${report.successUnits} |`);
  lines.push(`| Resume-skipped units | ${report.skippedUnits} |`);
  lines.push(`| Failed units | ${report.failedUnits} |`);
  lines.push(`| Total inserted rows | ${report.totalInserted} |`);
  lines.push(`| Total skipped rows | ${report.totalSkipped} |`);
  lines.push(`| Wall time (s) | ${report.wallSeconds} |`);
  lines.push('');

  if (report.failures.length) {
    lines.push('### Failed Units');
    lines.push('');
    lines.push('| Year | State | Attempts | Error |');
    lines.push('| ---: | :---: | ---: | --- |');
    for (const failure of report.failures) {
      lines.push(`| ${failure.year} | ${failure.state} | ${failure.attempts} | ${failure.error.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }

  if (report.macro) {
    lines.push('### Macro Pass');
    lines.push('');
    lines.push(`- Status: \`${report.macro.status}\``);
    if (report.macro.attempt != null) {
      lines.push(`- Attempt: \`${report.macro.attempt}\``);
    }
    if (report.macro.error) {
      lines.push(`- Error: \`${report.macro.error}\``);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function writeSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  await appendFile(summaryPath, `${markdown}\n`, 'utf8');
}

async function main() {
  const cli = parseArgs(process.argv);
  const now = Date.now();
  const baseUrl = (cli['base-url'] ?? process.env.ATLAS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const currentYear = new Date().getUTCFullYear();
  const startYear = clampInt(cli['start-year'], currentYear - 20, 1900, 2200);
  const endYear = clampInt(cli['end-year'], currentYear, 1900, 2200);
  if (startYear > endYear) {
    throw new Error('start-year must be <= end-year.');
  }

  const states = parseStates(cli.states ?? process.env.ATLAS_BACKFILL_STATES);
  const batchSize = clampInt(cli['batch-size'], 500, 1, 1000);
  const maxRetries = clampInt(cli['max-retries'], 3, 1, 10);
  const requestTimeoutMs = clampInt(cli['request-timeout-ms'], 120000, 30000, 900000);
  const includeCrops = parseBool(cli['include-crops'], true);
  const includeEconomics = parseBool(cli['include-economics'], true);
  const resumeMode = parseBool(cli.resume, true);
  const runMacro = parseBool(cli['run-macro'], true);
  const source = String(cli.source ?? 'USDA-NASS-BULK').trim() || 'USDA-NASS-BULK';
  const summaryJsonPath = String(cli['summary-json'] ?? '').trim();

  const headers = buildAuthHeaders();
  const progressByKey = await loadProgressRows(baseUrl, headers, source, startYear, endYear, states, requestTimeoutMs);

  const report = {
    baseUrl,
    source,
    startYear,
    endYear,
    states,
    maxRetries,
    resumeMode,
    totalUnits: (endYear - startYear + 1) * states.length,
    successUnits: 0,
    skippedUnits: 0,
    failedUnits: 0,
    totalInserted: 0,
    totalSkipped: 0,
    failures: [],
    macro: null,
    wallSeconds: 0,
  };

  console.log(`Atlas orchestrator target: ${baseUrl}`);
  console.log(`Units: years ${startYear}-${endYear}, states=${states.join(',')}, maxRetries=${maxRetries}, resume=${resumeMode}`);

  for (let year = startYear; year <= endYear; year += 1) {
    for (const state of states) {
      const key = keyForUnit(source, year, state);
      const existing = progressByKey.get(key);
      if (resumeMode && existing?.status === 'success') {
        report.skippedUnits += 1;
        report.totalInserted += Number(existing.inserted ?? 0);
        report.totalSkipped += Number(existing.skipped ?? 0);
        console.log(`↷ skip ${state}-${year} (already success, attempts=${existing.attempts ?? 0})`);
        continue;
      }

      const baseAttempts = Number(existing?.attempts ?? 0);
      let success = false;
      for (let attemptOffset = 1; attemptOffset <= maxRetries; attemptOffset += 1) {
        const attempt = baseAttempts + attemptOffset;
        console.log(`→ run ${state}-${year} attempt ${attempt}/${baseAttempts + maxRetries}`);
        await upsertProgress(
          baseUrl,
          headers,
          {
            source,
            year,
            state,
            status: 'running',
            increment_attempt: true,
            rows_total: Number(existing?.rows_total ?? 0),
            inserted: Number(existing?.inserted ?? 0),
            skipped: Number(existing?.skipped ?? 0),
            meta: {
              attempt,
              orchestrator: true,
              started_at: new Date().toISOString(),
            },
          },
          requestTimeoutMs,
        );

        try {
          const runStart = Date.now();
          const summary = await runBulkUnit({
            baseUrl,
            year,
            state,
            source,
            batchSize,
            includeCrops,
            includeEconomics,
            requestTimeoutMs,
          });
          const durationMs = Date.now() - runStart;
          await upsertProgress(
            baseUrl,
            headers,
            {
              source,
              year,
              state,
              status: 'success',
              rows_total: Number(summary.matched_rows ?? 0),
              inserted: Number(summary.inserted ?? 0),
              skipped: Number(summary.skipped ?? 0),
              meta: {
                attempt,
                duration_ms: durationMs,
                endpoint_errors: Number(summary.endpoint_errors ?? 0),
                sent_rows: Number(summary.sent_rows ?? 0),
                sent_batches: Number(summary.sent_batches ?? 0),
              },
            },
            requestTimeoutMs,
          );
          report.successUnits += 1;
          report.totalInserted += Number(summary.inserted ?? 0);
          report.totalSkipped += Number(summary.skipped ?? 0);
          success = true;
          break;
        } catch (error) {
          const message = truncate(error?.message || String(error), 2000);
          await upsertProgress(
            baseUrl,
            headers,
            {
              source,
              year,
              state,
              status: 'failed',
              rows_total: Number(existing?.rows_total ?? 0),
              inserted: Number(existing?.inserted ?? 0),
              skipped: Number(existing?.skipped ?? 0),
              last_error: message,
              meta: {
                attempt,
                orchestrator: true,
                failed_at: new Date().toISOString(),
              },
            },
            requestTimeoutMs,
          );
          if (attemptOffset === maxRetries) {
            report.failedUnits += 1;
            report.failures.push({ year, state, attempts: attempt, error: message });
          } else {
            console.log(`warn: retrying ${state}-${year} after failure: ${message}`);
          }
        }
      }

      if (!success) {
        console.log(`error: unit failed after retries ${state}-${year}`);
      }
    }
  }

  report.macro = await maybeRunMacro({
    enabled: runMacro,
    baseUrl,
    headers,
    startYear,
    endYear,
    source,
    maxRetries,
    timeoutMs: requestTimeoutMs,
  });
  if (report.macro.status === 'failed') {
    report.failedUnits += 1;
    report.failures.push({
      year: endYear,
      state: 'US',
      attempts: Number(report.macro.attempt ?? maxRetries),
      error: truncate(report.macro.error ?? 'macro ingest failed', 2000),
    });
  }

  report.wallSeconds = Math.round((Date.now() - now) / 1000);
  const summaryMarkdown = renderSummaryMarkdown(report);
  await writeSummary(summaryMarkdown);
  console.log(summaryMarkdown);

  if (summaryJsonPath) {
    await writeFile(summaryJsonPath, JSON.stringify(report, null, 2), 'utf8');
  }

  if (report.failedUnits > 0) {
    throw new Error(`Backfill orchestrator completed with failures: ${report.failedUnits}`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
