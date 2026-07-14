import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPTS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'prompts');

/** Loads a prompt file kept outside src/ so prompts can be tuned without touching app code. */
export async function loadPrompt(relativePath: string): Promise<string> {
  return readFile(join(PROMPTS_ROOT, relativePath), 'utf-8');
}
