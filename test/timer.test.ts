import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TimerStore } from '../src/timer.ts';

test('the minimum is met at the exact boundary, without rounding early', () => {
  let now = 50_000_000_000n;
  const timers = new TimerStore(() => now);
  const initial = timers.start(1800);
  assert.deepEqual(initial, {
    timer_id: initial.timer_id,
    min_seconds: 1800,
    elapsed_seconds: 0,
    remaining_seconds: 1800,
    minimum_met: false,
  });

  for (const [offset, elapsed, remaining, met] of [
    [1n, 0, 1800, false],
    [1_799_000_000_001n, 1799, 1, false],
    [1_799_999_999_999n, 1799, 1, false],
    [1_800_000_000_000n, 1800, 0, true],
    [1_800_000_000_001n, 1800, 0, true],
    [1_805_500_000_000n, 1805, 0, true],
  ] as const) {
    now = 50_000_000_000n + offset;
    const status = timers.check(initial.timer_id);
    assert.equal(status.elapsed_seconds, elapsed);
    assert.equal(status.remaining_seconds, remaining);
    assert.equal(status.minimum_met, met);
    assert.deepEqual(timers.check(initial.timer_id), status);
  }
});

test('starting and checking other timers does not reset existing timers', () => {
  let now = 0n;
  const timers = new TimerStore(() => now);
  const first = timers.start(1800);
  now = 900_000_000_000n;
  const second = timers.start(60);
  assert.notEqual(first.timer_id, second.timer_id);
  assert.equal(timers.check(first.timer_id).elapsed_seconds, 900);

  now += 60_000_000_000n;
  assert.equal(timers.check(second.timer_id).minimum_met, true);
  assert.equal(timers.check(first.timer_id).remaining_seconds, 840);
  assert.equal(timers.check(first.timer_id).minimum_met, false);
});

test('invalid durations and timers from a previous store are rejected', () => {
  const timers = new TimerStore(() => 0n);
  for (const duration of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => timers.start(duration), /positive safe integer/);
  }
  const max = timers.start(Number.MAX_SAFE_INTEGER);
  assert.equal(max.remaining_seconds, Number.MAX_SAFE_INTEGER);
  assert.equal(max.minimum_met, false);
  assert.throws(() => timers.check('missing'), /Unknown timer_id/);
  assert.throws(() => new TimerStore().check(max.timer_id), /cannot be verified/);
});
