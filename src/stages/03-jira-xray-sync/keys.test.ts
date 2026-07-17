import { describe, expect, it } from 'vitest';
import { clauseCacheKey } from '../01-requirement-analyst/clauseCache.js';
import { registryKeyForInput } from './xrayRegistry.js';

describe('state-namespacing keys', () => {
  it('registryKeyForInput normalizes slashes + case and prefixes the backend mode', () => {
    expect(registryKeyForInput('C:\\Repo\\Sample-BRD.md', 'stub')).toBe('stub:c:/repo/sample-brd.md');
  });

  it('the same input under different backends is namespaced apart (no stub/live/kiwi collisions)', () => {
    const stub = registryKeyForInput('a.md', 'stub');
    const live = registryKeyForInput('a.md', 'live');
    const kiwi = registryKeyForInput('a.md', 'kiwi');
    expect(new Set([stub, live, kiwi]).size).toBe(3);
  });

  it('clauseCacheKey appends the clause id after a # so entries are per-clause', () => {
    expect(clauseCacheKey('a.md', 'kiwi', '2-1-login')).toBe('kiwi:a.md#2-1-login');
    expect(clauseCacheKey('a.md', 'kiwi', '2-1-login')).not.toBe(clauseCacheKey('a.md', 'kiwi', '2-2-logout'));
  });
});
