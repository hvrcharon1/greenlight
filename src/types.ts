/**
 * Core types for Greenlight — the auto-approval daemon for Claude Code.
 */

// ─── Config ───────────────────────────────────────────────────────────────────

export type ApprovalMode =
  | 'auto'          // Silently approve everything not on denylist
  | 'interactive'   // Pause and ask the user for each prompt (passthrough)
  | 'audit-only';   // Log what would be approved but do NOT send keystrokes

export interface GreenlightConfig {
  /** How prompts are handled. Default: "auto" */
  mode: ApprovalMode;

  /** Tool names / action substrings to auto-approve. Wildcard "*" = all. */
  allow: string[];

  /**
   * Substrings in the prompt text that should NEVER be auto-approved.
   * Matched case-insensitively. Takes precedence over `allow`.
   */
  deny: string[];

  /** Path to the append-only audit log file. Default: "./greenlight.log" */
  logFile: string;

  /**
   * If true, Greenlight detects prompts and logs decisions but sends
   * no keystrokes to the spawned process. Useful for dry-running rules.
   */
  dryRun: boolean;

  /**
   * Milliseconds to wait after detecting a prompt before sending the
   * approval keystroke. Gives the terminal time to fully render.
   * Default: 120
   */
  responseDelayMs: number;

  /** Emit verbose debug lines to stdout. Default: false */
  verbose: boolean;
}

// ─── Prompt Detection ─────────────────────────────────────────────────────────

/** The category of prompt Greenlight has detected. */
export type PromptType =
  | 'yn-inline'      // "[Y/n]" or "[y/N]" style inline prompts
  | 'arrow-select'   // Arrow-key menu ("❯ Yes / No")
  | 'confirm-enter'; // Press <Enter> to confirm style

/** A detected approval prompt from the spawned process output. */
export interface PromptMatch {
  /** Which pattern family matched */
  type: PromptType;
  /** The raw terminal buffer fragment that triggered detection */
  raw: string;
  /** Human-readable description of the action being requested */
  action: string;
  /** Tool name if parseable (e.g. "Bash", "Read", "Write") */
  tool?: string;
  /** Name of the regex/pattern that fired */
  pattern: string;
}

// ─── Approval Records ─────────────────────────────────────────────────────────

export type ApprovalDecision = 'approved' | 'denied' | 'escalated';

/** Written to the audit log for every detected prompt. */
export interface ApprovalRecord {
  timestamp: string;        // ISO-8601
  pid: number;              // PID of the spawned process
  prompt: PromptMatch;
  decision: ApprovalDecision;
  reason: string;           // e.g. "allow list matched: Bash"
  dryRun: boolean;
}

// ─── Daemon Events ────────────────────────────────────────────────────────────

export interface DaemonOptions {
  /** Resolved config to run with */
  config: GreenlightConfig;
  /** The command to spawn (e.g. ["claude"]) */
  command: string[];
  /** Working directory for the spawned process */
  cwd?: string;
}

export interface DaemonResult {
  exitCode: number;
  totalPrompts: number;
  autoApproved: number;
  denied: number;
  escalated: number;
}
