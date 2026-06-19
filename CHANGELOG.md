# Changelog

All notable changes to **Greenlight** will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-06-20

### Added
- Initial public release of Greenlight
- PTY daemon (`src/daemon.ts`) — spawns any command inside a pseudo-terminal
- Prompt detector (`src/detector.ts`) — ANSI-stripped pattern engine covering:
  - Claude Code tool-use `[Y/n]` prompts
  - Inquirer-style arrow-key TUI selectors (`❯ Yes`)
  - Generic `[Y/n]` / `[y/N]` / `(y/n)` inline prompts
  - "Press Enter to continue" confirmations
  - Read / Write file confirmation prompts
- Approver (`src/approver.ts`) — allow/deny/escalate decision engine
- Logger (`src/logger.ts`) — coloured console output + append-only NDJSON audit log
- Config loader (`src/config.ts`) — cosmiconfig + Zod validation, sensible defaults
- CLI (`src/index.ts`) — full Commander-based CLI with:
  - `--mode auto | interactive | audit-only`
  - `--allow / --deny` comma-separated overrides
  - `--dry-run` (detect & log, never send keystrokes)
  - `--delay <ms>` keystroke delay
  - `--verbose` debug output
  - `--list-patterns` — print all built-in pattern names
  - Session summary on exit
- 300 ms debounce to prevent duplicate keystrokes on multi-chunk prompt flushes
- PTY resize relay (`SIGWINCH` → `ptyProcess.resize`)
- Example config (`greenlight.config.example.json`)
- Sober dark-mode logo (`assets/logo.svg`)
