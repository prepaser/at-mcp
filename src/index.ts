#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { TimerStore } from './timer.ts';
import { currentTime } from './time.ts';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const statusSchema = z.object({
  timer_id: z.uuid(),
  min_seconds: z.int().positive(),
  elapsed_seconds: z.int().nonnegative(),
  remaining_seconds: z.int().nonnegative(),
  minimum_met: z.boolean(),
});

function result(data: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

serveStdio(() => {
  const timers = new TimerStore();
  const server = new McpServer({ name: 'at-mcp', version }, {
    instructions: `When the user requests a minimum task duration, call start_timer and preserve timer_id. Do not report completion until both the current minimum has elapsed and the requested work is complete. Call check_timer to verify elapsed time and continue useful work while the minimum is unmet. Never treat timer errors as proof of elapsed time or silently replace a lost timer. Honor explicit stop requests.

1. Convert the duration to whole seconds, rounding up, and call start_timer at the beginning of work. For 30 minutes, use min_seconds: 1800. Preserve the returned timer_id and min_seconds in task context, including context summaries. Reuse that timer for the task.
2. Call check_timer after long tool calls, at task phase changes, and immediately before a completion response. Use its result rather than estimating elapsed time yourself.
3. Even if the main implementation appears finished, use the remaining time for task-relevant review, investigation, or unresolved verification. Do not fill time with idle waiting, rapid timer polling, redundant test runs, or unrelated changes.
4. For an unchanged minimum, require minimum_met: true. Reaching the minimum duration is not a reason to stop unfinished work. Elapsed time includes tool waits and does not prove active effort.
5. Progress updates, status questions, and context compaction do not end the task or reset its timer. Retain the duration requirement unless the user explicitly cancels or changes it. If the minimum changes, keep the same timer and preserve the revised minimum in task context. Convert the revised duration to whole seconds, rounding up, and require elapsed_seconds to reach it instead of using minimum_met, which still refers to the original minimum. The revised duration is measured from the original task start unless the user explicitly requests a new start.
6. If a timer call fails, correct invalid arguments or retry a transient failure. An unknown or lost timer cannot verify earlier elapsed time. If timing cannot be verified or required task input or tools are unavailable, report the limitation instead of claiming completion.
Without a minimum-duration request, do not start a timer automatically.`,
  });

  server.registerTool('start_timer', {
    description: 'Start a timer at the beginning of a task with a user-requested minimum duration. Convert the duration to whole seconds, rounding up (30 minutes = 1800). Preserve timer_id and min_seconds in task context and summaries. Each call creates a new timer; reuse the existing timer for the same task, including after status questions and context compaction.',
    inputSchema: z.strictObject({ min_seconds: z.int().positive() }),
    outputSchema: statusSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, ({ min_seconds }) => result(timers.start(min_seconds)));

  server.registerTool('check_timer', {
    description: 'Check the saved timer after long tool calls, at phase changes, and immediately before a completion response. Require both the current minimum duration and task completion. minimum_met refers to the original min_seconds; if the user revises the minimum, compare elapsed_seconds with the revised duration rounded up to whole seconds, using the same timer. Continue useful work within task scope until both conditions are met; avoid idle waiting, rapid polling, redundant tests, and unrelated changes. Progress updates are allowed. Honor explicit stop requests immediately. Errors do not establish elapsed time; recover if possible or report the limitation without claiming completion.',
    inputSchema: z.strictObject({ timer_id: z.uuid() }),
    outputSchema: statusSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, ({ timer_id }) => result(timers.check(timer_id)));

  server.registerTool('get_current_time', {
    description: 'Get the current system time as an ISO 8601 timestamp with a UTC offset and a time_zone name or offset. Optional time_zone accepts names such as Asia/Seoul or UTC and offsets such as +09:00; the default is the server\'s local zone, which may differ from the user\'s. For "work until 9 PM", resolve the user\'s date and time zone; ask if unclear. Preserve the absolute deadline in task context and summaries. Check it after long tool calls and before completion; continue useful work until it is reached. Honor explicit stop requests. Use start_timer and check_timer for minimum task durations.',
    inputSchema: z.strictObject({ time_zone: z.string().min(1).optional() }),
    outputSchema: z.object({ current_time: z.iso.datetime({ offset: true }), time_zone: z.string() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, ({ time_zone }) => result(currentTime(time_zone)));

  return server;
});
