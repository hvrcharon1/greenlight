# 🟢 Greenlight

> **Zero-friction auto-approval daemon for Claude Code permission prompts**

Greenlight wraps any interactive AI coding agent (primarily **Claude Code**) inside a pseudo-terminal and silently approves the repetitive `[Y/n]`, arrow-key, and tick-based permission prompts — so your workflow never stalls waiting for a keypress.

![Greenlight logo](./assets/logo.svg)

---

## The Problem

Claude Code (and similar agents) pauses constantly to ask:

```
Allow bash_20250124 to execute: git status? [Y/n]
```
```
? Allow Write to src/utils/index.ts? (Use arrow keys)
❯ Yes
  No
```

These prompts are essential for safety, but when you're deep in a multi-step build session they become friction. Greenlight monitors the terminal output, recognises these prompts, and sends the right keystroke — automatically.

---

## Features

- **PTY-native** — spawns your command inside a real pseudo-terminal, so all TUI rendering (colour, cursor, arrow-key menus) works exactly as normal
- **ANSI-aware detector** — strips terminal escape sequences before pattern matching; never confused by colour codes
- **Allow / Deny rules** — wildcard `"*"` to approve everything, or a fine-grained list of tool names and action substrings
- **Denylist** — hardcoded protection against destructive patterns (`rm -rf`, `DROP TABLE`, fork bombs…)
- **Escalation** — prompts not covered by the allow list are passed through to the human unchanged
- **Dry-run mode** — detect and log every prompt without ever sending a keystroke; great for auditing your rule set
- **NDJSON audit log** — every decision appended as a JSON object; easy to `jq` and grep
- **300 ms debounce** — prevents double-keystrokes when a prompt flushes across multiple PTY chunks
- **Session summary** — on exit, prints a count of approved / denied / escalated prompts

---

## Install

```bash
# Global install (recommended)
npm install -g greenlight

# Or run without installing
npx greenlight -- claude
```

> **Requires Node.js ≥ 18** and the `node-pty` native addon (pre-built binaries are bundled for macOS, Linux, and Windows).

---

## Quick Start

```bash
# Wrap Claude Code — approve everything except the built-in denylist
greenlight -- claude

# Dry-run: see what would be approved without acting
greenlight --dry-run --verbose -- claude

# Only allow Read and Write tools; block anything matching "rm -rf"
greenlight --allow "Read,Write" --deny "rm -rf" -- claude

# Audit mode — log to file, you still approve manually
greenlight --mode audit-only --log-file ./session.log -- claude
```

---

## CLI Reference

```
Usage: greenlight [options] -- <command> [args...]

Options:
  -m, --mode <mode>       auto | interactive | audit-only  (default: auto)
  --allow <tools>         Comma-separated tool/action names to allow. "*" = all
  --deny <patterns>       Comma-separated substrings never auto-approved
  -l, --log-file <path>   Append-only NDJSON audit log path
  --dry-run               Detect & log decisions; never send keystrokes
  --delay <ms>            Keystroke delay in ms after prompt detected (default: 120)
  -v, --verbose           Emit debug output
  --list-patterns         Print all built-in pattern names and exit
  -V, --version           Output version number
  -h, --help              Display help
```

### Modes

| Mode | Behaviour |
|------|-----------|
| `auto` _(default)_ | Silently approve everything not on the denylist |
| `interactive` | Full passthrough — Greenlight logs but never types for you |
| `audit-only` | Like interactive, but also writes decisions to the log file |

---

## Configuration

Greenlight uses [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) to find config from the following places (in order):

- `greenlight.config.json`
- `greenlight.config.js`
- `.greenlightrc` / `.greenlightrc.json`
- `"greenlight"` key in `package.json`

Copy the example and customise:

```bash
cp greenlight.config.example.json greenlight.config.json
```

```json
{
  "mode": "auto",
  "allow": ["*"],
  "deny": [
    "rm -rf",
    "DROP TABLE",
    "DROP DATABASE",
    "format c:",
    "mkfs"
  ],
  "logFile": "./greenlight.log",
  "dryRun": false,
  "responseDelayMs": 120,
  "verbose": false
}
```

CLI flags always take precedence over the config file.

---

## Audit Log

Each approved/denied/escalated prompt is appended to the log file as a JSON line:

```json
{
  "timestamp": "2026-06-20T14:23:01.452Z",
  "pid": 18742,
  "prompt": {
    "type": "yn-inline",
    "raw": "Allow bash_20250124 to execute: git status? [Y/n]",
    "action": "Allow bash to execute: git status",
    "tool": "bash",
    "pattern": "claude-code-tool-yn"
  },
  "decision": "approved",
  "reason": "allow list: wildcard (*)",
  "dryRun": false
}
```

Parse with `jq`:

```bash
# Show all auto-approved entries
cat greenlight.log | jq 'select(.decision == "approved") | .prompt.action'

# Show everything that was denied
cat greenlight.log | jq 'select(.decision == "denied")'
```

---

## Detected Prompt Patterns

Run `greenlight --list-patterns` to see all patterns. Built-in patterns include:

| Pattern name | Matches |
|---|---|
| `claude-code-tool-yn` | `Allow bash_20250124 to execute: … [Y/n]` |
| `generic-yn` | Any `… [Y/n]` or `… [y/N]` |
| `arrow-select-yes-focused` | `❯ Yes` (TUI menu, Yes already selected) |
| `inquirer-arrow-keys` | `? <question> (Use arrow keys)` |
| `write-file-yn` | `Write to <path>? [Y/n]` |
| `read-file-yn` | `Read <path>? [Y/n]` |
| `press-enter` | `Press <Enter> to continue/confirm` |
| `do-you-want-to` | `Do you want to …? [Yes/No]` |
| `approve-yn-paren` | `…? (y/n)` |

---

## Architecture

```
greenlight
├── src/
│   ├── index.ts      CLI — Commander, banners, session summary
│   ├── daemon.ts     PTY daemon — spawn, relay, orchestrate
│   ├── detector.ts   ANSI-strip + pattern matching engine
│   ├── approver.ts   Allow/deny/escalate decision + keystroke selection
│   ├── logger.ts     Coloured stderr console + NDJSON file appender
│   ├── config.ts     cosmiconfig loader + Zod schema
│   └── types.ts      Shared TypeScript interfaces
├── assets/
│   └── logo.svg
└── greenlight.config.example.json
```

---

## Development

```bash
git clone https://github.com/hvrcharon1/greenlight.git
cd greenlight
npm install
npm run build      # compiles TypeScript → dist/
npm run dev        # ts-node in watch mode
npm test           # jest
```

---

## Safety Notes

- Greenlight **never bypasses a prompt** that matches the denylist, even in `auto` mode.
- Use `--dry-run` first on a new project to review what would be approved.
- The `--mode audit-only` flag lets you collect a real log without any automation risk.
- Greenlight does **not** modify Claude Code's own permission model — it simply responds to prompts in the terminal, exactly as you would.

---

## License

MIT © [hvrcharon1](https://github.com/hvrcharon1)
