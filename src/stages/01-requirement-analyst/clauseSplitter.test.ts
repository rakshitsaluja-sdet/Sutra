import { describe, expect, it } from 'vitest';
import { splitClauses } from './clauseSplitter.js';

describe('splitClauses', () => {
  it('wraps user-story input as a single synthetic root clause', () => {
    const { clauses, background } = splitClauses('As a user I want to log in so that I can see my account', 'user-story');
    expect(clauses).toHaveLength(1);
    expect(clauses[0]!.clauseId).toBe('root');
    expect(clauses[0]!.headingPath).toBe('(whole input)');
    expect(background).toBe('');
  });

  it('treats a heading-less BRD as a single root clause', () => {
    const { clauses } = splitClauses('Just a paragraph of prose with no markdown headings at all.', 'brd');
    expect(clauses).toHaveLength(1);
    expect(clauses[0]!.clauseId).toBe('root');
  });

  it('splits a BRD at the deepest heading level and captures the preamble as background', () => {
    const brd = ['# Title', '', '## 1. Background', 'Some context.', '', '## 2. Requirements', '', '### 2.1 Login', 'Login body.', '', '### 2.2 Logout', 'Logout body.'].join('\n');
    const { clauses, background } = splitClauses(brd, 'brd');
    expect(clauses.map((c) => c.clauseId)).toEqual(['2-1-login', '2-2-logout']);
    expect(clauses[0]!.rawText).toBe('Login body.');
    // Everything before the first clause-level (###) heading is background.
    expect(background).toContain('## 1. Background');
    expect(background).toContain('## 2. Requirements');
  });

  it('hashes clause bodies stably — same text same hash, changed text different hash', () => {
    const a = splitClauses('### A\nbody one', 'brd').clauses[0]!;
    const aAgain = splitClauses('### A\nbody one', 'brd').clauses[0]!;
    const b = splitClauses('### A\nbody two', 'brd').clauses[0]!;
    expect(a.hash).toBe(aAgain.hash);
    expect(a.hash).not.toBe(b.hash);
  });

  it('disambiguates duplicate heading slugs and assigns increasing order', () => {
    const { clauses } = splitClauses('### Dup\nfirst\n\n### Dup\nsecond', 'brd');
    expect(clauses.map((c) => c.clauseId)).toEqual(['dup', 'dup-2']);
    expect(clauses.map((c) => c.order)).toEqual([0, 1]);
  });
});
