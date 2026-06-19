#!/usr/bin/env node
/**
 * Greenlight CLI — entry point.
 *
 * Usage:
 *   greenlight [options] -- <command> [args...]
 *
 * Examples:
 *   greenlight -- claude
 *   greenlight --mode audit-only -- claude --no-color
 *   greenlight --dry-run --verbose -- claude
 *   greenlight --list-patterns
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, applyCliOverrides } from './config.js';
import { runDaemon } from './daemon.js';
import { listPatternNames } from './detector.js';
import type { ApprovalMode } from './types.js';

const pkg = { name: 'greenlight', version: '0.1.0' } as const;

// ─── CLI Definition ───────────────────────────────────────────────────────────

const program = new Command()
  .name(pkg.name)
  .version(pkg.version)
  .description(
    'Zero-friction auto-approval daemon for Claude Code permission prompts\n' +
    'https://github.com/hvrcharon1/greenlight',
  )
  .argument('[command...]', 'Command to run (use -- to separate from greenlight flags)')

  .option(
    '-m, --mode <mode>',
    'Approval mode: auto | interactive | audit-only  (default: auto)',
  )
  .option(
    '--allow <tools>',
    'Comma-separated tool/action names to allow. Use "*" for all.',
  )
  .option(
    '--deny <patterns>',
    'Comma-separated strings that should never be auto-approved.',
  )
  .option(
    '-l, --log-file <path>',
    'Path to the append-only NDJSON audit log',
  )
  .option(
    '--dry-run',
    'Detect and log decisions but never send keystrokes',
    false,
  )
  .option(
    '--delay <ms>',
    'Milliseconds to wait before sending each keystroke  (default: 120)',
    parseInt,
  )
  .option('-v, --verbose', 'Emit verbose debug output', false)
  .option('--list-patterns', 'Print all built-in prompt pattern names and exit')

  .addHelpText(
    'after',
    `
${chalk.bold('Modes:')}
  auto          Auto-approve everything not on the denylist  (default)
  interactive   Passthrough — Greenlight logs but never types for you
  audit-only    Like interactive but also writes decisions to the log file

${chalk.bold('Examples:')}
  ${chalk.dim('# Wrap Claude Code with full auto-approval')}
  greenlight -- claude

  ${chalk.dim('# Dry-run: see what would be approved without acting')}
  greenlight --dry-run --verbose -- claude

  ${chalk.dim('# Only allow Read + Write tools; deny rm -rf')}
  greenlight --allow "Read,Write" --deny "rm -rf" -- claude

  ${chalk.dim('# Audit mode — log to file, human still approves')}
  greenlight --mode audit-only --log-file ./session.log -- claude
`,
  );

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  program.parse();
  const opts = program.opts<{
    mode?: string;
    allow?: string;
    deny?: string;
    logFile?: string;
    dryRun?: boolean;
    delay?: number;
    verbose?: boolean;
    listPatterns?: boolean;
  }>();

  // -- list-patterns shortcut
  if (opts.listPatterns) {
    console.log(chalk.bold('Built-in prompt patterns:'));
    listPatternNames().forEach((n) => console.log(`  • ${n}`));
    process.exit(0);
  }

  const commandArgs = program.args;
  if (commandArgs.length === 0) {
    program.help();
  }

  // Load config then apply CLI overrides
  let config = await loadConfig();
  config = applyCliOverrides(config, {
    mode: opts.mode as ApprovalMode | undefined,
    allow: opts.allow?.split(',').map((s) => s.trim()),
    deny: opts.deny?.split(',').map((s) => s.trim()),
    logFile: opts.logFile,
    dryRun: opts.dryRun,
    responseDelayMs: opts.delay,
    verbose: opts.verbose,
  });

  // Banner
  const modeLabel = chalk.green(`[${config.mode}]`);
  const dryLabel = config.dryRun ? chalk.dim(' · dry-run') : '';
  console.error(
    chalk.bold.green('🟢 Greenlight') +
    chalk.dim(` v${pkg.version} `) +
    modeLabel +
    dryLabel,
  );

  try {
    const result = await runDaemon({ config, command: commandArgs });

    console.error(
      '\n' +
      chalk.bold('Session summary:\n') +
      `  Total prompts detected : ${result.totalPrompts}\n` +
      chalk.green(`  Auto-approved           : ${result.autoApproved}\n`) +
      chalk.red(`  Denied                  : ${result.denied}\n`) +
      chalk.yellow(`  Escalated to human      : ${result.escalated}`),
    );

    process.exit(result.exitCode);
  } catch (err) {
    console.error(chalk.red('[greenlight] Fatal error:'), err);
    process.exit(1);
  }
}

main();
