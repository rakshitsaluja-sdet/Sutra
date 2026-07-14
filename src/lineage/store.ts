import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LineageGraph } from './types.js';

/** JSON file persistence for Phase 1. Swap for a real store later behind this same interface. */
export interface LineageStore {
  save(graph: LineageGraph): Promise<void>;
  load(path: string): Promise<LineageGraph>;
}

export class JsonFileLineageStore implements LineageStore {
  constructor(private readonly filePath: string) {}

  async save(graph: LineageGraph): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(graph, null, 2), 'utf-8');
  }

  async load(path: string): Promise<LineageGraph> {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as LineageGraph;
  }
}
