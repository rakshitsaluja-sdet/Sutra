import { sha256Hex } from '../../utils/fsSafe.js';
import type { InputType } from './detectInputType.js';

export interface Clause {
  clauseId: string;
  headingPath: string;
  headingLevel: number;
  rawText: string;
  hash: string;
  order: number;
}

export interface SplitResult {
  /** Content before the first clause-level heading (title, background/intro prose) — sent verbatim, unhashed, to every clause's prompt. */
  background: string;
  clauses: Clause[];
}

interface HeadingMatch {
  level: number;
  text: string;
  index: number;
  lineEnd: number;
}

function findHeadings(rawText: string): HeadingMatch[] {
  const matches: HeadingMatch[] = [];
  const pattern = /^(#{1,6})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(rawText)) !== null) {
    matches.push({ level: m[1]!.length, text: m[2]!.trim(), index: m.index, lineEnd: m.index + m[0].length });
  }
  return matches;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'clause'
  );
}

/**
 * Splits a BRD into stable, individually-hashable clauses using the deepest
 * markdown heading level present as the clause boundary — matches the real
 * shape of every BRD sample in this repo (## sections, ### sub-requirements).
 * Degrades gracefully: no headings at all, or user-story mode, produces a
 * single synthetic 'root' clause covering the whole input, same as before
 * clause-splitting existed.
 */
export function splitClauses(rawText: string, inputType: InputType): SplitResult {
  if (inputType === 'user-story') {
    return {
      background: '',
      clauses: [{ clauseId: 'root', headingPath: '(whole input)', headingLevel: 0, rawText, hash: sha256Hex(rawText.trim()), order: 0 }],
    };
  }

  const headings = findHeadings(rawText);
  if (headings.length === 0) {
    return {
      background: '',
      clauses: [{ clauseId: 'root', headingPath: '(whole input)', headingLevel: 0, rawText, hash: sha256Hex(rawText.trim()), order: 0 }],
    };
  }

  const clauseLevel = Math.max(...headings.map((h) => h.level));
  const clauseHeadings = headings.filter((h) => h.level === clauseLevel);

  const firstClauseStart = clauseHeadings[0]!.index;
  const background = rawText.slice(0, firstClauseStart).trim();

  const seenSlugs = new Map<string, number>();
  const clauses: Clause[] = clauseHeadings.map((heading, order) => {
    const nextHeadingIndex = headings.find((h) => h.index > heading.index)?.index ?? rawText.length;
    const body = rawText.slice(heading.lineEnd, nextHeadingIndex).trim();

    let slug = slugify(heading.text);
    const seenCount = seenSlugs.get(slug) ?? 0;
    seenSlugs.set(slug, seenCount + 1);
    if (seenCount > 0) slug = `${slug}-${seenCount + 1}`;

    return {
      clauseId: slug,
      headingPath: heading.text,
      headingLevel: heading.level,
      rawText: body,
      hash: sha256Hex(body),
      order,
    };
  });

  return { background, clauses };
}
