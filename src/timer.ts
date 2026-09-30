import { randomUUID } from 'node:crypto';
import { hrtime } from 'node:process';

const NS_PER_SECOND = 1_000_000_000n;

export type TimerStatus = {
  timer_id: string;
  min_seconds: number;
  elapsed_seconds: number;
  remaining_seconds: number;
  minimum_met: boolean;
};

type Timer = { started: bigint; min_seconds: number };

export class TimerStore {
  #timers = new Map<string, Timer>();
  #now: () => bigint;

  constructor(now: () => bigint = hrtime.bigint) {
    this.#now = now;
  }

  start(minSeconds: number): TimerStatus {
    if (!Number.isSafeInteger(minSeconds) || minSeconds <= 0) {
      throw new Error('min_seconds must be a positive safe integer.');
    }

    const id = randomUUID();
    this.#timers.set(id, { started: this.#now(), min_seconds: minSeconds });
    return this.check(id);
  }

  check(id: string): TimerStatus {
    const timer = this.#timers.get(id);
    if (!timer) {
      throw new Error('Unknown timer_id. Timers are lost when the server restarts; the minimum duration cannot be verified.');
    }

    const elapsed = this.#now() - timer.started;
    const minimum = BigInt(timer.min_seconds) * NS_PER_SECOND;
    const remaining = minimum > elapsed ? minimum - elapsed : 0n;

    return {
      timer_id: id,
      min_seconds: timer.min_seconds,
      elapsed_seconds: Number(elapsed / NS_PER_SECOND),
      remaining_seconds: Number((remaining + NS_PER_SECOND - 1n) / NS_PER_SECOND),
      minimum_met: elapsed >= minimum,
    };
  }
}
