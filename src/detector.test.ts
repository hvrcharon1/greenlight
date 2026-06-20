import { detectPrompt, stripAnsi, listPatternNames } from './detector.js';

describe('stripAnsi', () => {
  it('removes CSI colour escape sequences', () => {
    const coloured = '\x1B[32mAllow bash to run: ls? [Y/n]\x1B[0m';
    expect(stripAnsi(coloured)).toBe('Allow bash to run: ls? [Y/n]');
  });

  it('leaves plain text untouched', () => {
    expect(stripAnsi('no escapes here')).toBe('no escapes here');
  });
});

describe('detectPrompt', () => {
  it('matches Claude Code tool-use [Y/n] prompts', () => {
    const match = detectPrompt('Allow bash_20250124 to execute: git status? [Y/n]');
    expect(match).not.toBeNull();
    expect(match?.pattern).toBe('claude-code-tool-yn');
    expect(match?.tool).toBe('bash');
    expect(match?.action).toContain('git status');
  });

  it('matches a generic [y/n] prompt', () => {
    const match = detectPrompt('Overwrite file? [y/N]');
    expect(match).not.toBeNull();
    expect(match?.type).toBe('yn-inline');
  });

  it('matches an arrow-select prompt with Yes focused', () => {
    const match = detectPrompt('❯ Yes\n  No');
    expect(match).not.toBeNull();
    expect(match?.pattern).toBe('arrow-select-yes-focused');
  });

  it('matches an inquirer-style arrow-key question', () => {
    const match = detectPrompt('? Proceed with install (Use arrow keys)');
    expect(match).not.toBeNull();
    expect(match?.pattern).toBe('inquirer-arrow-keys');
  });

  it('matches a write-file confirmation', () => {
    const match = detectPrompt('Write to src/utils/index.ts? [Y/n]');
    expect(match).not.toBeNull();
    expect(match?.pattern).toBe('write-file-yn');
    expect(match?.tool).toBe('Write');
  });

  it('matches a read-file confirmation', () => {
    const match = detectPrompt('Read src/index.ts? [Y/n]');
    expect(match).not.toBeNull();
    expect(match?.pattern).toBe('read-file-yn');
    expect(match?.tool).toBe('Read');
  });

  it('matches a "Press Enter to continue" prompt', () => {
    const match = detectPrompt('Press Enter to continue');
    expect(match).not.toBeNull();
    expect(match?.type).toBe('confirm-enter');
  });

  it('matches a "Do you want to" prompt', () => {
    const match = detectPrompt('Do you want to delete this file? [Yes/No]');
    expect(match).not.toBeNull();
    expect(match?.pattern).toBe('do-you-want-to');
  });

  it('matches an (y/n) parenthesised prompt', () => {
    const match = detectPrompt('Proceed with deployment? (y/n)');
    expect(match).not.toBeNull();
    expect(match?.pattern).toBe('approve-yn-paren');
  });

  it('returns null for non-prompt output', () => {
    expect(detectPrompt('Compiling src/index.ts...')).toBeNull();
  });

  it('strips ANSI codes before matching', () => {
    const coloured = '\x1B[36mAllow bash_99 to execute: npm test? [Y/n]\x1B[0m';
    const match = detectPrompt(coloured);
    expect(match).not.toBeNull();
    expect(match?.pattern).toBe('claude-code-tool-yn');
  });
});

describe('listPatternNames', () => {
  it('returns all registered pattern names', () => {
    const names = listPatternNames();
    expect(names).toContain('claude-code-tool-yn');
    expect(names).toContain('arrow-select-yes-focused');
    expect(names.length).toBeGreaterThanOrEqual(9);
  });
});
