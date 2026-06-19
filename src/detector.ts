/**
 * Detector — scans raw PTY output for Claude Code approval prompts.
 *
 * Claude Code (and similar AI coding agents) surfaces two families of
 * permission prompts:
 *
 *   1. Inline [Y/n] prompts  — "Allow bash_20250124 to run: ls? [Y/n]"
 *   2. Arrow-key TUI menus   — an inquirer-style list rendered via ANSI escapes
 *                              where "❯ Yes" is the first option
 *   3. Plain <Enter> confirms — "Press Enter to continue"
 *
 * The detector strips ANSI escape codes before pattern matching so that
 * terminal colour sequences don't confuse the regexes.
 */

import type { PromptMatch } from './types.js';

// ─── ANSI Stripping ───────────────────────────────────────────────────────────

// Covers CSI sequences, OSC, and common escape codes.
const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /[\x1B\x9B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|[\x1B\x9B][PX^_].*?(?:\x1B\\|\x07)|[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

export function stripAnsi(raw: string): string {
  return raw.replace(ANSI_RE, '');
}

// ─── Pattern Definitions ─────────────────────────────────────────────────────

interface PatternDef {
  name: string;
  /** Regex to test against the stripped buffer */
  re: RegExp;
  type: PromptMatch['type'];
  /** Extract a human-readable action description from the match */
  extractAction: (m: RegExpMatchArray) => string;
  /** Extract a tool name from the match if possible */
  extractTool?: (m: RegExpMatchArray) => string | undefined;
}

const PATTERNS: PatternDef[] = [
  // ── Claude Code tool-use permission prompt ──────────────────────────────
  // Example: "Allow bash_20250124 to execute: git status? [Y/n]"
  {
    name: 'claude-code-tool-yn',
    re: /Allow\s+([\w_-]+)\s+to\s+([\w\s]+)[:?]?\s*(.+?)?\s*\[Y\/n\]/i,
    type: 'yn-inline',
    extractAction: (m) => `Allow ${m[1]} to ${m[2]}${m[3] ? `: ${m[3].trim()}` : ''}`,
    extractTool: (m) => m[1].replace(/_\d+$/, ''), // strip timestamp suffix
  },

  // ── Generic [Y/n] / [y/N] inline prompt ────────────────────────────────
  // Example: "Overwrite file? [y/N]"
  {
    name: 'generic-yn',
    re: /(.{5,120})\s*\[y\/n\]/i,
    type: 'yn-inline',
    extractAction: (m) => m[1].trim(),
  },

  // ── Arrow-select "❯ Yes" already highlighted ────────────────────────────
  // Claude Code renders "❯ Yes" when "Yes" is already focused — pressing
  // Enter confirms it.
  {
    name: 'arrow-select-yes-focused',
    re: /[❯>]\s+Yes/u,
    type: 'arrow-select',
    extractAction: () => 'Approve highlighted selection (❯ Yes)',
  },

  // ── Inquirer-style "? <question> (Use arrow keys)" ──────────────────────
  {
    name: 'inquirer-arrow-keys',
    re: /\?\s+(.{5,120})\s+\(Use arrow keys\)/i,
    type: 'arrow-select',
    extractAction: (m) => m[1].trim(),
  },

  // ── Claude Code write-file confirmation ─────────────────────────────────
  // "Write to <path>? [Y/n]"
  {
    name: 'write-file-yn',
    re: /Write\s+(?:to\s+)?(['"`]?)(.+?)\1\s*\?\s*\[Y\/n\]/i,
    type: 'yn-inline',
    extractAction: (m) => `Write to ${m[2]}`,
    extractTool: () => 'Write',
  },

  // ── Claude Code read-file confirmation ──────────────────────────────────
  {
    name: 'read-file-yn',
    re: /Read\s+(?:file\s+)?(['"`]?)(.+?)\1\s*\?\s*\[Y\/n\]/i,
    type: 'yn-inline',
    extractAction: (m) => `Read ${m[2]}`,
    extractTool: () => 'Read',
  },

  // ── Press Enter to continue ──────────────────────────────────────────────
  {
    name: 'press-enter',
    re: /Press\s+(?:<Enter>|ENTER|Enter)\s+to\s+(continue|confirm|proceed)/i,
    type: 'confirm-enter',
    extractAction: (m) => `Press Enter to ${m[1]}`,
  },

  // ── "Do you want to allow …? [Yes/No]" ─────────────────────────────────
  {
    name: 'do-you-want-to',
    re: /Do you want to\s+(.{5,120})\?\s*\[(?:Yes|Y)\/(?:No|N)\]/i,
    type: 'yn-inline',
    extractAction: (m) => `Do you want to ${m[1].trim()}?`,
  },

  // ── Approve? (y/n) ──────────────────────────────────────────────────────
  {
    name: 'approve-yn-paren',
    re: /(.{5,120})\s*\(y\/n\)/i,
    type: 'yn-inline',
    extractAction: (m) => m[1].trim(),
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scans a PTY output chunk for known approval prompts.
 * Returns the first match found, or `null` if nothing matched.
 *
 * We purposely return only the *first* match per chunk to avoid
 * sending duplicate keystrokes when the terminal echoes the same
 * prompt multiple times in one flush.
 */
export function detectPrompt(rawChunk: string): PromptMatch | null {
  const clean = stripAnsi(rawChunk);

  for (const def of PATTERNS) {
    const m = clean.match(def.re);
    if (m) {
      return {
        type: def.type,
        raw: rawChunk,
        action: def.extractAction(m),
        tool: def.extractTool?.(m),
        pattern: def.name,
      };
    }
  }

  return null;
}

/**
 * Returns all registered pattern names.
 * Used by the `--list-patterns` CLI flag.
 */
export function listPatternNames(): string[] {
  return PATTERNS.map((p) => p.name);
}
