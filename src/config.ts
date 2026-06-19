import { cosmiconfig } from 'cosmiconfig';
import { z } from 'zod';
import type { GreenlightConfig } from './types.js';

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  mode: z.enum(['auto', 'interactive', 'audit-only']).default('auto'),
  allow: z.array(z.string()).default(['*']),
  deny: z.array(z.string()).default([
    'rm -rf',
    'DROP TABLE',
    'DROP DATABASE',
    'format c:',
    'mkfs',
    ':(){:|:&};:',
  ]),
  logFile: z.string().default('./greenlight.log'),
  dryRun: z.boolean().default(false),
  responseDelayMs: z.number().int().min(0).max(5000).default(120),
  verbose: z.boolean().default(false),
});

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: GreenlightConfig = ConfigSchema.parse({});

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Loads config from (in priority order):
 *   1. greenlight.config.json / greenlight.config.js / .greenlightrc
 *   2. "greenlight" key inside package.json
 *   3. Built-in defaults
 *
 * CLI flags override whatever is loaded here.
 */
export async function loadConfig(
  searchFrom: string = process.cwd(),
): Promise<GreenlightConfig> {
  const explorer = cosmiconfig('greenlight', {
    searchPlaces: [
      'greenlight.config.json',
      'greenlight.config.js',
      'greenlight.config.cjs',
      '.greenlightrc',
      '.greenlightrc.json',
      '.greenlightrc.js',
      'package.json',
    ],
  });

  const result = await explorer.search(searchFrom);
  const raw = result?.config ?? {};

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid Greenlight config:\n${issues}`);
  }

  return parsed.data;
}

/**
 * Merges CLI-level overrides onto a loaded config object.
 * Only overrides properties that are explicitly provided (not undefined).
 */
export function applyCliOverrides(
  base: GreenlightConfig,
  overrides: Partial<GreenlightConfig>,
): GreenlightConfig {
  return { ...base, ...Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined),
  ) } as GreenlightConfig;
}
