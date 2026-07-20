import { describe, expect, it } from 'vitest';
import { extractDescription } from './jiraReader.js';
import { brdTextToInput, clausesFromChildren, jiraSourceId } from './jiraInputSource.js';

const child = (key: string, summary: string, descriptionText: string) => ({ key, summary, descriptionText, attachments: [] });

describe('jira input — child stories to clauses', () => {
  it('maps each child issue to one clause keyed by its Jira issue key', () => {
    const clauses = clausesFromChildren([child('SCRUM-11', 'Login', 'As a user I want to log in'), child('SCRUM-12', 'Logout', 'As a user I want to log out')]);
    expect(clauses.map((c) => c.clauseId)).toEqual(['SCRUM-11', 'SCRUM-12']);
    expect(clauses.map((c) => c.order)).toEqual([0, 1]);
    expect(clauses[0]!.rawText).toContain('Login');
    expect(clauses[0]!.rawText).toContain('As a user I want to log in');
  });

  it('hashes each story stably — an edit changes only that story hash', () => {
    const before = clausesFromChildren([child('SCRUM-11', 'Login', 'v1'), child('SCRUM-12', 'Logout', 'same')]);
    const after = clausesFromChildren([child('SCRUM-11', 'Login', 'v2 changed'), child('SCRUM-12', 'Logout', 'same')]);
    expect(after[0]!.hash).not.toBe(before[0]!.hash); // edited story changed
    expect(after[1]!.hash).toBe(before[1]!.hash); // untouched story unchanged
  });
});

describe('jira input — BRD text to clauses', () => {
  it('splits a heading-structured BRD from an epic/issue', () => {
    const input = brdTextToInput('# Title\n\n## Reqs\n\n### A\nbody a\n\n### B\nbody b', 'brd');
    expect(input.clauses.map((c) => c.clauseId)).toEqual(['a', 'b']);
    expect(input.inputType).toBe('brd');
  });
});

describe('jira input — description extraction', () => {
  it('converts Jira wiki-markup headings to markdown so BRDs split', () => {
    expect(extractDescription('h2. Requirements\nsome text')).toBe('## Requirements\nsome text');
  });

  it('flattens ADF rich text (Jira Cloud) into markdown-ish text with headings', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Login' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'The user logs in.' }] },
      ],
    };
    const text = extractDescription(adf);
    expect(text).toContain('### Login');
    expect(text).toContain('The user logs in.');
  });

  it('returns empty string for a null/absent description', () => {
    expect(extractDescription(null)).toBe('');
  });
});

describe('jira source identity', () => {
  it('produces a stable synthetic id for cache/graph keying', () => {
    expect(jiraSourceId({ epicKey: 'SCRUM-1' })).toBe('jira:SCRUM-1');
    expect(jiraSourceId({ issueKey: 'SCRUM-9' })).toBe('jira:SCRUM-9');
  });
});
