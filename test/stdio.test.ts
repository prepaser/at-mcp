import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { TimerStatus } from '../src/timer.ts';

function status(result: Awaited<ReturnType<Client['callTool']>>): TimerStatus {
  assert.ok(!result.isError, JSON.stringify(result));
  assert.ok(result.structuredContent);
  const text = result.content?.find(block => block.type === 'text');
  assert.ok(text?.type === 'text');
  assert.deepEqual(JSON.parse(text.text), result.structuredContent);
  return result.structuredContent as TimerStatus;
}

function connection() {
  const script = [
    "process.on('SIGTERM', () => { console.error('received SIGTERM'); process.exit(143); });",
    "process.stdin.on('end', () => console.error('received EOF'));",
    `await import(${JSON.stringify(new URL('../src/index.ts', import.meta.url).href)});`,
  ].join('\n');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--input-type=module', '-e', script],
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  return {
    client: new Client({ name: 'at-mcp-test', version: '0.1.0' }),
    transport,
    stderr: () => stderr,
  };
}

test('stdio exposes timers, validates calls, and loses state on restart', { timeout: 15_000 }, async t => {
  const options = { signal: t.signal };
  const first = connection();
  let timerId = '';
  try {
    await first.client.connect(first.transport, options);
    const { tools } = await first.client.listTools({}, options);
    assert.deepEqual(tools.map(tool => tool.name), ['start_timer', 'check_timer']);
    assert.ok(tools.every(tool => tool.outputSchema));

    const started = status(await first.client.callTool({ name: 'start_timer', arguments: { min_seconds: 1800 } }, options));
    timerId = started.timer_id;
    assert.equal(started.min_seconds, 1800);
    assert.equal(started.minimum_met, false);
    const checked = status(await first.client.callTool({ name: 'check_timer', arguments: { timer_id: timerId.toUpperCase() } }, options));
    assert.equal(checked.timer_id, timerId);
    assert.equal(checked.minimum_met, false);
    assert.ok(checked.elapsed_seconds >= started.elapsed_seconds);
    assert.ok(checked.remaining_seconds > 0);

    for (const duration of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1800']) {
      const result = await first.client.callTool({ name: 'start_timer', arguments: { min_seconds: duration } }, options);
      assert.equal(result.isError, true);
    }
    const malformed = await first.client.callTool({ name: 'check_timer', arguments: { timer_id: 'invalid' } }, options);
    assert.equal(malformed.isError, true);
  } finally {
    await first.client.close();
    await first.transport.close();
  }
  assert.match(first.stderr(), /received EOF/);
  assert.doesNotMatch(first.stderr(), /received SIGTERM/);
  assert.equal(first.transport.pid, null);

  const second = connection();
  try {
    await second.client.connect(second.transport, options);
    const missing = await second.client.callTool({ name: 'check_timer', arguments: { timer_id: timerId } }, options);
    assert.equal(missing.isError, true);
    assert.match(JSON.stringify(missing.content), /cannot be verified/);
    const fresh = status(await second.client.callTool({ name: 'start_timer', arguments: { min_seconds: 1800 } }, options));
    assert.notEqual(fresh.timer_id, timerId);
    assert.equal(fresh.minimum_met, false);
  } finally {
    await second.client.close();
    await second.transport.close();
  }
  assert.match(second.stderr(), /received EOF/);
  assert.doesNotMatch(second.stderr(), /received SIGTERM/);
  assert.equal(second.transport.pid, null);
});
