/**
 * Logger — dual-channel logging for Greenlight.
 *
 *  • Console channel: Human-readable coloured lines (respects `verbose`)
 *  • File channel:    Append-only NDJSON audit log (one JSON object per line)
 */

import { createWriteStream, type WriteStream } from 'fs';
import chalk from 'chalk';
import type { ApprovalRecord, GreenlightConfig } from './types.js';

// ─── Decision colour map ──────────────────────────────────────────────────────

const decisionColour = {
  approved: chalk.green,
  denied: chalk.red,
  escalated: chalk.yellow,
} as const;

const decisionIcon = {
  approved: '✔',
  denied: '✖',
  escalated: '⚡',
} as const;

// ─── Logger class ─────────────────────────────────────────────────────────────

export class GreenlightLogger {
  private stream: WriteStream | null = null;
  private verbose: boolean;
  private dryRun: boolean;

  constructor(config: GreenlightConfig) {
    this.verbose = config.verbose;
    this.dryRun = config.dryRun;

    if (config.logFile) {
      this.stream = createWriteStream(config.logFile, { flags: 'a' });
    }
  }

  /** Log an approval decision both to console and to the audit file. */
  logDecision(record: ApprovalRecord): void {
    const colour = decisionColour[record.decision];
    const icon = decisionIcon[record.decision];
    const dry = record.dryRun ? chalk.dim(' [dry-run]') : '';
    const tool = record.prompt.tool ? chalk.dim(` (${record.prompt.tool})`) : '';

    const consoleLine =
      `${chalk.dim(record.timestamp)} ` +
      colour(`${icon} ${record.decision.toUpperCase()}`) +
      tool +
      dry +
      `  ${record.prompt.action}` +
      (this.verbose ? chalk.dim(`\n   reason: ${record.reason}\n   pattern: ${record.prompt.pattern}`) : '');

    console.error(consoleLine); // stderr keeps stdout clean for pipe consumers

    this.writeJson(record);
  }

  /** Emit a verbose debug message to stderr. */
  debug(msg: string): void {
    if (this.verbose) {
      console.error(chalk.dim(`[greenlight] ${msg}`));
    }
  }

  /** Emit an informational banner line. */
  info(msg: string): void {
    console.error(chalk.cyan(`[greenlight] ${msg}`));
  }

  /** Emit a warning. */
  warn(msg: string): void {
    console.error(chalk.yellow(`[greenlight] ⚠  ${msg}`));
  }

  /** Emit an error. */
  error(msg: string, err?: unknown): void {
    console.error(chalk.red(`[greenlight] ✖  ${msg}`));
    if (err && this.verbose) {
      console.error(err);
    }
  }

  /** Write a raw NDJSON line to the audit log file. */
  private writeJson(record: ApprovalRecord): void {
    if (!this.stream) return;
    try {
      this.stream.write(JSON.stringify(record) + '\n');
    } catch {
      // Don't crash the daemon over a logging failure.
    }
  }

  /** Close the file stream gracefully. */
  close(): void {
    this.stream?.end();
    this.stream = null;
  }
}
