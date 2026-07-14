#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationNamePattern = /^\d+_[a-z0-9_]+\.sql$/;

export function buildImportSql(migrationName, migrationSql) {
  if (!migrationNamePattern.test(migrationName)) {
    throw new Error(`Invalid migration name: ${migrationName}`);
  }

  const escapedName = migrationName.replaceAll("'", "''");
  return `CREATE TABLE IF NOT EXISTS "d1_migrations" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
${migrationSql.trim()}
INSERT OR IGNORE INTO "d1_migrations" (name) VALUES ('${escapedName}');
`;
}

function parseArgs(args) {
  const [mode, migrationName, ...rest] = args;
  if (mode !== '--local' && mode !== '--remote') {
    throw new Error('First argument must be --local or --remote.');
  }
  if (!migrationNamePattern.test(migrationName ?? '')) {
    throw new Error('Second argument must be a migration filename such as 0001_name.sql.');
  }
  if (mode === '--remote' && rest.length > 0) {
    throw new Error('Remote migration does not accept extra arguments.');
  }
  if (
    mode === '--local' &&
    rest.length > 0 &&
    (rest.length !== 2 || rest[0] !== '--persist-to' || !rest[1])
  ) {
    throw new Error('Local extras must be --persist-to <directory>.');
  }
  return { mode, migrationName, extraArgs: rest };
}

async function run() {
  const { mode, migrationName, extraArgs } = parseArgs(process.argv.slice(2));
  const migrationPath = path.join(workerRoot, 'migrations', migrationName);
  const migrationSql = await readFile(migrationPath, 'utf8');
  const importSql = buildImportSql(migrationName, migrationSql);
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'reploom-d1-migration-'));
  const importPath = path.join(tempDirectory, migrationName);
  const wranglerBinary = path.join(
    workerRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler',
  );

  try {
    await writeFile(importPath, importSql, { mode: 0o600 });
    const child = spawn(
      wranglerBinary,
      ['d1', 'execute', 'overdrive-rank', mode, '--file', importPath, '--yes', ...extraArgs],
      { cwd: workerRoot, env: process.env, stdio: 'inherit' },
    );
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
    if (exitCode !== 0) {
      throw new Error(`Wrangler exited with code ${exitCode}.`);
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
