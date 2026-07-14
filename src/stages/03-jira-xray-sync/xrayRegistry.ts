import { readFile } from 'node:fs/promises';
import { writeFileEnsuringDir } from '../../utils/fsSafe.js';
import { logger } from '../../utils/logger.js';

// Deliberately at the project root, not under generated/ — this must survive
// across runs (generated/ is treated as regenerated pipeline output), and is
// meant to be git-tracked so a team shares the same Test Set/Plan mapping.
const REGISTRY_PATH = 'xray-registry.json';

export interface RegistryEntry {
  testSetKey: string;
  testSetIssueId: string;
  testPlanKey: string;
  testPlanIssueId: string;
  createdAt: string;
}

interface RegistryFile {
  entries: Record<string, RegistryEntry>;
}

/**
 * Stable identity for "this BRD/epic" today is its input file path — once
 * Jira-epic-attachment reading exists, this should key off the Epic's issue
 * key instead, which is the more natural stable identity across edits.
 *
 * Namespaced by mode so a stub run's fabricated keys (STUB-SET-1, etc.) can
 * never be mistakenly reused as if they were real Xray issue keys after
 * switching XRAY_MODE to live for the same input file.
 */
export function registryKeyForInput(inputSourceFile: string, mode: 'stub' | 'live'): string {
  return `${mode}:${inputSourceFile.replace(/\\/g, '/').toLowerCase()}`;
}

async function loadRegistry(): Promise<RegistryFile> {
  try {
    const raw = await readFile(REGISTRY_PATH, 'utf-8');
    return JSON.parse(raw) as RegistryFile;
  } catch {
    return { entries: {} };
  }
}

export async function getRegistryEntry(key: string): Promise<RegistryEntry | undefined> {
  const registry = await loadRegistry();
  return registry.entries[key];
}

export async function saveRegistryEntry(key: string, entry: RegistryEntry): Promise<void> {
  const registry = await loadRegistry();
  registry.entries[key] = entry;
  await writeFileEnsuringDir(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  logger.info({ key, testSetKey: entry.testSetKey, testPlanKey: entry.testPlanKey }, '[jira-xray-sync] registry updated');
}
