import { readFile } from 'node:fs/promises';

/** Plain text/markdown pass-through — the LLM reads markdown fine as-is. */
export async function parsePlainText(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8');
}
