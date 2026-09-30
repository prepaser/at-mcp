import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { TimerStore, type TimerStatus } from './timer.ts';

const statusSchema = z.object({
  timer_id: z.uuid(),
  min_seconds: z.int().positive(),
  elapsed_seconds: z.int().nonnegative(),
  remaining_seconds: z.int().nonnegative(),
  minimum_met: z.boolean(),
});

function result(status: TimerStatus) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(status) }],
    structuredContent: status,
  };
}

serveStdio(() => {
  const timers = new TimerStore();
  const server = new McpServer({ name: 'at-mcp', version: '0.1.0' }, {
    instructions: `When the user requests a minimum task duration:
1. Convert the duration to seconds and call start_timer at the beginning of work. For 30 minutes, use min_seconds: 1800. Preserve the returned timer_id and min_seconds in task context, including context summaries. Reuse that timer for the task.
2. Call check_timer after long tool calls, at task phase changes, and immediately before a completion response. Use its result rather than estimating elapsed time yourself.
3. Do not end the task with a completion response while minimum_met is false, even if the main implementation appears finished. Continue task-relevant implementation, review, investigation, or unresolved verification. Do not fill time with idle waiting, rapid timer polling, redundant test runs, or unrelated changes.
4. Require both minimum_met: true and completion of the requested work before reporting completion. Reaching the minimum duration is not a reason to stop unfinished work. Elapsed time includes tool waits and does not prove active effort.
5. Progress updates, status questions, and context compaction do not end the task or reset its timer. Retain the duration requirement through follow-up messages unless the user explicitly cancels or changes it. Follow an explicit request to stop immediately.
6. If a timer call fails, correct invalid arguments or retry a transient failure. An unknown or lost timer cannot verify earlier elapsed time: do not claim the minimum was met or silently start a replacement. If timing cannot be verified or required task input or tools are unavailable, report the limitation instead of claiming completion.
Without a minimum-duration request, do not start a timer automatically.`,
  });

  server.registerTool('start_timer', {
    description: 'Start a timer at the beginning of a task with a user-requested minimum duration. Convert the duration to seconds (30 minutes = 1800). Preserve timer_id and min_seconds in task context and summaries. Each call creates a new timer; reuse the existing timer for the same task, including after status questions and context compaction.',
    inputSchema: z.strictObject({ min_seconds: z.int().positive() }),
    outputSchema: statusSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, ({ min_seconds }) => result(timers.start(min_seconds)));

  server.registerTool('check_timer', {
    description: 'Check the saved timer after long tool calls, at phase changes, and immediately before a completion response. Do not report completion until minimum_met is true and the requested work is complete. While false, continue useful work within task scope; avoid idle waiting, rapid polling, redundant tests, and unrelated changes. Progress updates are allowed. Keep the duration requirement unless the user explicitly changes or cancels it, and honor explicit stop requests immediately. Errors do not establish elapsed time; recover if possible or report the limitation without claiming completion.',
    inputSchema: z.strictObject({ timer_id: z.uuid() }),
    outputSchema: statusSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, ({ timer_id }) => result(timers.check(timer_id)));

  return server;
});
