# at-mcp

A local MCP server that lets agents check whether a user-requested minimum task duration has elapsed. For a request such as “work for at least 30 minutes,” the agent starts a 1,800-second timer and checks it before its final response.

The server measures elapsed time, including tool waits. It does not measure active effort, judge task completion, or block an agent from ending early. Compliance depends on the agent following the instructions.

## Setup

Requires Node.js 24.12.0 or newer and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm start
```

TypeScript runs directly in Node.js without a build step. The server listens on stdin and writes MCP messages to stdout. It exits when the client closes stdin.

## Connect

Add the following server entry to your MCP host's configuration, adapting the surrounding structure to that host. Replace the paths with your actual Node.js executable and checkout paths. Launch Node.js directly so package-manager output cannot enter the protocol stream.

```json
{
  "mcpServers": {
    "at-mcp": {
      "command": "/usr/bin/node",
      "args": ["/absolute/path/to/at-mcp/src/index.ts"]
    }
  }
}
```

## Tools

| Tool | Input | Behavior |
| --- | --- | --- |
| `start_timer` | `min_seconds`: positive safe integer | Creates an independent timer and returns its UUID and status. |
| `check_timer` | `timer_id`: UUID | Returns the current status without modifying the timer. |

Both tools return the same status as structured content and JSON text:

```json
{
  "timer_id": "e39dadf5-6cd0-40ab-88df-cbb2fb1b27dc",
  "min_seconds": 1800,
  "elapsed_seconds": 1240,
  "remaining_seconds": 560,
  "minimum_met": false
}
```

Elapsed seconds are rounded down, and remaining seconds are rounded up to a minimum of zero. `minimum_met` compares the unrounded elapsed duration with the requested minimum, so it cannot become true early because of rounding. Timing uses Node.js's monotonic `process.hrtime.bigint()` and is unaffected by system time adjustments.

Each start call creates a new timer; it does not reset an existing one. Timers stay in process memory until the server exits, including after their minimum duration has elapsed. There is no automatic expiration, persistence, reset, or waiting tool. A server restart loses all timers. Invalid inputs and unknown IDs return `isError: true`; missing timers are never treated as having met their minimum.

## Agent instructions

The tool descriptions and server instructions explain the workflow. Add the following to your agent's instructions if you want an explicit rule:

```text
When the user requests a minimum task duration:
1. Convert the duration to seconds and call start_timer at the beginning of work. For 30 minutes, use min_seconds: 1800. Preserve the returned timer_id and min_seconds in task context, including context summaries. Reuse that timer for the task.
2. Call check_timer after long tool calls, at task phase changes, and immediately before a completion response. Use its result rather than estimating elapsed time yourself.
3. Do not end the task with a completion response while minimum_met is false, even if the main implementation appears finished. Continue task-relevant implementation, review, investigation, or unresolved verification. Do not fill time with idle waiting, rapid timer polling, redundant test runs, or unrelated changes.
4. Require both minimum_met: true and completion of the requested work before reporting completion. Reaching the minimum duration is not a reason to stop unfinished work. Elapsed time includes tool waits and does not prove active effort.
5. Progress updates, status questions, and context compaction do not end the task or reset its timer. Retain the duration requirement through follow-up messages unless the user explicitly cancels or changes it. Follow an explicit request to stop immediately.
6. If a timer call fails, correct invalid arguments or retry a transient failure. An unknown or lost timer cannot verify earlier elapsed time: do not claim the minimum was met or silently start a replacement. If timing cannot be verified or required task input or tools are unavailable, report the limitation instead of claiming completion.
Without a minimum-duration request, do not start a timer automatically.
```
