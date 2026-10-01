# at-mcp

A local MCP server that helps agents stay aware of elapsed time and check whether a user-requested minimum task duration has been met. For a request such as “work for at least 30 minutes,” the agent starts a 1,800-second timer and checks it before its final response.

The server measures elapsed time, including tool waits. It does not measure active effort, judge task completion, or block an agent from ending early. Compliance depends on the agent following the instructions.

## Setup

Requires Node.js 24.12.0 or newer and npm.

```sh
npx --yes at-mcp@latest
```

The server listens on stdin and writes MCP messages to stdout. It exits when the client closes stdin. It is normally launched by your MCP host rather than used interactively.

## Connect

Add the following entry to your MCP host's configuration, adapting the surrounding structure to that host:

```json
{
  "mcpServers": {
    "at-mcp": {
      "command": "npx",
      "args": ["--yes", "at-mcp@latest"]
    }
  }
}
```

### Codex

```sh
codex mcp add at-mcp -- npx --yes at-mcp@latest
```

Or add this to `~/.codex/config.toml` ([Codex MCP docs](https://developers.openai.com/codex/mcp/)):

```toml
[mcp_servers.at-mcp]
command = "npx"
args = ["--yes", "at-mcp@latest"]
```

## Tools

| Tool | Input | Behavior |
| --- | --- | --- |
| `start_timer` | `min_seconds`: positive safe integer | Creates an independent timer and returns its UUID and status. |
| `check_timer` | `timer_id`: UUID | Returns the current status without modifying the timer. |
| `get_current_time` | Optional `time_zone`, e.g. `Asia/Seoul` or `UTC` | Returns the current system time with its UTC offset and resolved time zone. Defaults to the server's local time zone. |

For a request such as “work until 9 PM,” call `get_current_time` with the user's time zone and interpret the deadline using the returned date and local time. Preserve that deadline in task context and check the time before reporting completion. If the date or time zone is unclear, ask the user rather than assuming the server's default matches their location.

With `{"time_zone":"Asia/Seoul"}`, `get_current_time` returns the following as structured content and JSON text:

```json
{
  "current_time": "2026-10-01T21:00:00.123+09:00",
  "time_zone": "Asia/Seoul"
}
```

Time-zone offsets reflect daylight saving time. If the server's local zone has no usable name, `time_zone` contains its current UTC offset instead. This tool uses the system clock; minimum-duration checks use the monotonic timers.

The timer tools return the same status as structured content and JSON text:

```json
{
  "timer_id": "e39dadf5-6cd0-40ab-88df-cbb2fb1b27dc",
  "min_seconds": 1800,
  "elapsed_seconds": 1240,
  "remaining_seconds": 560,
  "minimum_met": false
}
```

Elapsed seconds are rounded down, and remaining seconds are rounded up to a minimum of zero. `minimum_met` compares the unrounded elapsed duration with the requested minimum, so it cannot become true early because of rounding. Timing uses Node.js's monotonic `process.hrtime.bigint()` and is unaffected by system time adjustments. Timer ID lookups are case-insensitive and return the canonical lowercase ID.

Each start call creates a new timer; it does not reset an existing one. Timers stay in process memory until the server exits, including after their minimum duration has elapsed. There is no automatic expiration, persistence, reset, or waiting tool. A server restart loses all timers. Invalid inputs and unknown IDs return `isError: true`; missing timers are never treated as having met their minimum.

## Development

Install pnpm and work from the repository checkout:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm start
```

Development runs TypeScript directly in Node.js. `pnpm build` replaces `dist/` with the compiled JavaScript CLI so old build artifacts cannot enter a release. To connect a host to your checkout, use `node` as the command and the absolute path to `src/index.ts` as its argument.

## Publishing

Log in once with `npm login`, then publish:

```sh
npm publish --access public
```

Publishing runs type checks, tests, and the build automatically, then installs a temporary package and verifies its CLI and all MCP tools. Run `pnpm check:package` to perform the package check separately. npm reads the version from `package.json`. For subsequent releases, bump it with `npm version patch --no-git-tag-version`, using `minor` or `major` as appropriate.
