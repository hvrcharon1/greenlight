/**
 * Daemon — spawns the target command inside a pseudo-terminal (PTY),
 * streams its output to the user, and intercepts approval prompts.
 *
 * Flow:
 *   1. Spawn via node-pty (full PTY so interactive TUI tools render correctly)
 *   2. On each data chunk → run through Detector
 *   3. If a prompt is found → run through Approver → maybe write a keystroke
 *   4. Collect stats; return a DaemonResult on exit
 */

import * as pty from 'node-pty';
import { detectPrompt } from './detector.js';
import { buildRecord, evaluate } from './approver.js';
import { GreenlightLogger } from './logger.js';
import type { DaemonOptions, DaemonResult } from './types.js';

// Guard: prevent firing twice on the same prompt if the PTY flushes
// it in back-to-back chunks (common with slow terminals).
const DEBOUNCE_MS = 300;

export async function runDaemon(options: DaemonOptions): Promise<DaemonResult> {
  const { config, command, cwd = process.cwd() } = options;
  const logger = new GreenlightLogger(config);

  const [file, ...args] = command;
  if (!file) throw new Error('No command provided to greenlight');

  logger.info(
    `Starting in ${config.mode} mode${config.dryRun ? ' [DRY RUN]' : ''}: ${command.join(' ')}`,
  );

  const ptyProcess = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols: process.stdout.columns || 220,
    rows: process.stdout.rows || 50,
    cwd,
    env: { ...process.env },
  });

  const pid = ptyProcess.pid;
  logger.debug(`Spawned PID ${pid}`);

  // ── Stats ──────────────────────────────────────────────────────────────
  let totalPrompts = 0;
  let autoApproved = 0;
  let denied = 0;
  let escalated = 0;

  // ── Debounce state ─────────────────────────────────────────────────────
  let lastPatternFired = '';
  let lastFiredAt = 0;

  // ── stdin → PTY (so the user can still type if in interactive/escalated)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', (chunk: Buffer) => {
    ptyProcess.write(chunk.toString());
  });

  // ── PTY output → stdout + detection ───────────────────────────────────
  ptyProcess.onData((chunk: string) => {
    process.stdout.write(chunk);

    // In audit-only or interactive mode, skip sending keystrokes
    if (config.mode === 'interactive') return;

    const match = detectPrompt(chunk);
    if (!match) return;

    // Debounce: same pattern fired within DEBOUNCE_MS → skip
    const now = Date.now();
    if (match.pattern === lastPatternFired && now - lastFiredAt < DEBOUNCE_MS) {
      logger.debug(`Debounced duplicate: ${match.pattern}`);
      return;
    }
    lastPatternFired = match.pattern;
    lastFiredAt = now;

    totalPrompts++;
    const result = evaluate(match, config);

    const record = buildRecord(pid, match, result, config.dryRun);
    logger.logDecision(record);

    if (result.decision === 'approved' && !config.dryRun) {
      setTimeout(() => {
        ptyProcess.write(result.keystroke!);
      }, config.responseDelayMs);
      autoApproved++;
    } else if (result.decision === 'denied') {
      if (!config.dryRun) {
        setTimeout(() => {
          ptyProcess.write('n\r');
        }, config.responseDelayMs);
      }
      denied++;
    } else {
      // Escalated — human must handle it
      escalated++;
    }
  });

  // ── Resize relay ───────────────────────────────────────────────────────
  process.stdout.on('resize', () => {
    ptyProcess.resize(
      process.stdout.columns || 220,
      process.stdout.rows || 50,
    );
  });

  // ── Await exit ─────────────────────────────────────────────────────────
  const exitCode = await new Promise<number>((resolve) => {
    ptyProcess.onExit(({ exitCode: code }) => {
      resolve(code ?? 0);
    });
  });

  // Restore terminal
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  logger.close();

  return { exitCode, totalPrompts, autoApproved, denied, escalated };
}
