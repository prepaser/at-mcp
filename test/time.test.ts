import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentTime } from '../src/time.ts';

test('time zones preserve the instant across midnight and daylight saving changes', () => {
  const cases = [
    ['2026-10-01T15:00:00.123Z', 'Asia/Seoul', '2026-10-02T00:00:00.123+09:00'],
    ['2026-10-01T00:00:00.123Z', 'Asia/Kathmandu', '2026-10-01T05:45:00.123+05:45'],
    ['2026-03-08T06:59:59.123Z', 'America/New_York', '2026-03-08T01:59:59.123-05:00'],
    ['2026-03-08T07:00:00.123Z', 'America/New_York', '2026-03-08T03:00:00.123-04:00'],
    ['2026-11-01T05:59:59.123Z', 'America/New_York', '2026-11-01T01:59:59.123-04:00'],
    ['2026-11-01T06:00:00.123Z', 'America/New_York', '2026-11-01T01:00:00.123-05:00'],
  ];
  for (const [instant, zone, expected] of cases) {
    const time = currentTime(zone, new Date(instant));
    assert.equal(time.current_time, expected);
    assert.equal(Date.parse(time.current_time), Date.parse(instant));
  }
  assert.throws(() => currentTime('Invalid/Zone'), RangeError);
});

test('the local zone remains usable with POSIX TZ settings', () => {
  const original = process.env.TZ;
  const now = new Date('2026-10-01T00:00:00.123Z');
  try {
    for (const [zone, offset] of [['UTC0', '+00:00'], ['UTC+9', '-09:00'], ['GMT+3', '-03:00']]) {
      process.env.TZ = zone;
      const time = currentTime(undefined, now);
      assert.ok(time.current_time.endsWith(offset));
      assert.equal(Date.parse(time.current_time), now.getTime());
      assert.equal(currentTime(time.time_zone, now).current_time, time.current_time);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
