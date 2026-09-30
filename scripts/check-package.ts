import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { TimerStatus } from '../src/timer.ts';

const exec = promisify(execFile);
const project = fileURLToPath(new URL('..', import.meta.url));
const npmOptions = { cwd: project, timeout: 120_000 };
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const dir = await mkdtemp(join(tmpdir(), 'at-mcp-package-'));
const client = new Client({ name: 'at-mcp-package-check', version: pkg.version });
let transport: StdioClientTransport | undefined;

try {
  await exec('npm', ['pack', '--ignore-scripts', '--dry-run=false', '--pack-destination', dir], npmOptions);
  const archives = (await readdir(dir)).filter(name => name.endsWith('.tgz'));
  assert.equal(archives.length, 1);
  const consumer = join(dir, 'consumer');
  await exec('npm', ['install', '--dry-run=false', '--prefix', consumer, '--omit=dev', '--no-audit', '--no-fund', join(dir, archives[0])], npmOptions);

  transport = new StdioClientTransport({
    command: join(consumer, 'node_modules', '.bin', 'at-mcp'),
    cwd: consumer,
  });
  const options = { signal: AbortSignal.timeout(15_000) };
  await client.connect(transport, options);
  assert.equal(client.getServerVersion()?.version, pkg.version);
  const { tools } = await client.listTools({}, options);
  assert.deepEqual(tools.map(tool => tool.name), ['start_timer', 'check_timer']);

  const started = await client.callTool({ name: 'start_timer', arguments: { min_seconds: 600 } }, options);
  assert.ok(!started.isError);
  const start = started.structuredContent as TimerStatus | undefined;
  assert.ok(start);
  const timerId = start.timer_id;
  assert.ok(typeof timerId === 'string');
  assert.equal(start.minimum_met, false);
  const checked = await client.callTool({ name: 'check_timer', arguments: { timer_id: timerId.toUpperCase() } }, options);
  assert.ok(!checked.isError);
  const check = checked.structuredContent as TimerStatus | undefined;
  assert.ok(check);
  assert.equal(check.timer_id, timerId);
  assert.equal(check.minimum_met, false);
  console.log('Installed package CLI and MCP tools verified.');
} finally {
  try {
    await client.close();
  } finally {
    try {
      await transport?.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
