/**
 * Approver — decides whether a detected prompt should be auto-approved,
 * denied, or escalated back to the human.
 *
 * Decision logic:
 *   1. If prompt text matches a denylist entry  → DENY
 *   2. If allow list contains "*" OR the tool/action matches → APPROVE
 *   3. Otherwise → ESCALATE (pass back to human)
 */

import type {
  ApprovalDecision,
  ApprovalRecord,
  GreenlightConfig,
  PromptMatch,
} from './types.js';

// ─── Keystroke Constants ──────────────────────────────────────────────────────

/** Sent to a PTY to confirm a [Y/n] or "❯ Yes" prompt */
export const KEYSTROKE_YES = 'y\r';

/** Sent to confirm a "Press <Enter> to continue" prompt */
export const KEYSTROKE_ENTER = '\r';

/** Sent to deny a [Y/n] prompt */
export const KEYSTROKE_NO = 'n\r';

// ─── Matching helpers ─────────────────────────────────────────────────────────

function matchesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function isWildcard(allow: string[]): boolean {
  return allow.some((a) => a.trim() === '*');
}

// ─── Core Decision ────────────────────────────────────────────────────────────

export interface ApprovalResult {
  decision: ApprovalDecision;
  reason: string;
  /** The keystroke string to write to the PTY, if decision is 'approved' */
  keystroke: string | null;
}

/**
 * Evaluates a detected prompt against the current config and returns
 * the decision + the keystroke to send (if any).
 */
export function evaluate(
  prompt: PromptMatch,
  config: GreenlightConfig,
): ApprovalResult {
  const searchText = [prompt.action, prompt.tool ?? '', prompt.raw]
    .join(' ')
    .toLowerCase();

  // ── 1. Denylist check (highest priority) ──────────────────────────────
  const deniedBy = config.deny.find((d) =>
    searchText.includes(d.toLowerCase()),
  );
  if (deniedBy) {
    return {
      decision: 'denied',
      reason: `denylist matched: "${deniedBy}"`,
      keystroke: KEYSTROKE_NO,
    };
  }

  // ── 2. Allow check ────────────────────────────────────────────────────
  const allowAll = isWildcard(config.allow);
  const toolMatched =
    prompt.tool !== undefined && matchesAny(prompt.tool, config.allow);
  const actionMatched = matchesAny(prompt.action, config.allow);

  if (allowAll || toolMatched || actionMatched) {
    const reason = allowAll
      ? 'allow list: wildcard (*)'
      : toolMatched
        ? `allow list matched tool: "${prompt.tool}"`
        : `allow list matched action: "${prompt.action}"`;

    const keystroke =
      prompt.type === 'confirm-enter' ? KEYSTROKE_ENTER : KEYSTROKE_YES;

    return { decision: 'approved', reason, keystroke };
  }

  // ── 3. Escalate (not in allowlist, not in denylist) ───────────────────
  return {
    decision: 'escalated',
    reason: 'no allow rule matched — escalating to human',
    keystroke: null,
  };
}

// ─── Record Builder ───────────────────────────────────────────────────────────

export function buildRecord(
  pid: number,
  prompt: PromptMatch,
  result: ApprovalResult,
  dryRun: boolean,
): ApprovalRecord {
  return {
    timestamp: new Date().toISOString(),
    pid,
    prompt,
    decision: result.decision,
    reason: result.reason,
    dryRun,
  };
}
