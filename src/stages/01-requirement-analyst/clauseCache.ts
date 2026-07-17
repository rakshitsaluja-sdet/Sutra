import { readFile } from 'node:fs/promises';
import { writeFileEnsuringDir } from '../../utils/fsSafe.js';
import { logger } from '../../utils/logger.js';
import type { LineageId } from '../../lineage/types.js';
import type { UserStory } from './schema.js';
import type { TestCase } from '../02-test-case-designer/schema.js';

// Deliberately at the project root, not under generated/ — same rationale as
// xray-registry.json: this must survive across runs (generated/ is treated
// as regenerated pipeline output) and is meant to be git-tracked so a team
// shares the same cache instead of every machine regenerating from scratch.
const CACHE_PATH = 'clause-cache.json';

export interface CachedTestCase {
  testCaseId: string;
  lineageId: LineageId;
  testCaseSnapshot: TestCase;
  xrayKey: string;
  xrayIssueId?: string;
  featurePath?: string;
  stepDefPath?: string;
  pageObjectPath?: string;
  utilPaths: string[];
  featureLineageId?: LineageId;
  stepDefLineageId?: LineageId;
  pageObjectLineageId?: LineageId;
}

export interface CachedStory {
  storyId: string;
  lineageId: LineageId;
  storySnapshot: UserStory;
  testCases: CachedTestCase[];
}

export interface ClauseCacheEntry {
  clauseId: string;
  clauseHash: string;
  headingPath: string;
  inputSourceFile: string;
  status: 'active' | 'deprecated';
  sourceLineageId: LineageId;
  stories: CachedStory[];
  updatedAt: string;
}

interface ClauseCacheFile {
  version: 1;
  entries: Record<string, ClauseCacheEntry>;
}

const EMPTY_FILE: ClauseCacheFile = { version: 1, entries: {} };

/**
 * Namespaced by mode so a stub run's fabricated Xray keys can never be
 * mistaken for real ones after switching XRAY_MODE to live for the same
 * input file — same rationale as xrayRegistry.ts's registryKeyForInput.
 */
export function clauseCacheKey(inputSourceFile: string, mode: 'stub' | 'live', clauseId: string): string {
  return `${mode}:${inputSourceFile.replace(/\\/g, '/').toLowerCase()}#${clauseId}`;
}

async function loadCache(): Promise<ClauseCacheFile> {
  try {
    const raw = await readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(raw) as ClauseCacheFile;
  } catch {
    return { ...EMPTY_FILE, entries: {} };
  }
}

export async function getCacheEntry(key: string): Promise<ClauseCacheEntry | undefined> {
  const cache = await loadCache();
  return cache.entries[key];
}

export async function saveCacheEntry(key: string, entry: ClauseCacheEntry): Promise<void> {
  const cache = await loadCache();
  cache.entries[key] = entry;
  await writeFileEnsuringDir(CACHE_PATH, JSON.stringify(cache, null, 2));
  logger.info({ key, clauseId: entry.clauseId, status: entry.status }, '[clause-cache] entry updated');
}

/** All entries for a given input file (any clause, any status) — used for delete/rename detection across a run. */
export async function getEntriesForInput(inputSourceFile: string, mode: 'stub' | 'live'): Promise<ClauseCacheEntry[]> {
  const cache = await loadCache();
  const prefix = `${mode}:${inputSourceFile.replace(/\\/g, '/').toLowerCase()}#`;
  return Object.entries(cache.entries)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, entry]) => entry);
}
