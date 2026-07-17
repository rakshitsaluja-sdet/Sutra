import { describe, expect, it } from 'vitest';
import { classifyFailure } from './diagnose.js';

describe('classifyFailure', () => {
  it('flags a missing feature (404 / connection failure) as possibly-not-implemented', () => {
    expect(classifyFailure('Error: got 404 Not Found')).toBe('possibly-not-implemented');
    expect(classifyFailure('page.goto: net::ERR_CONNECTION_REFUSED')).toBe('possibly-not-implemented');
    expect(classifyFailure('This page could not be found')).toBe('possibly-not-implemented');
  });

  it('flags selector problems as likely-drift', () => {
    expect(classifyFailure('locator resolved to 0 elements; waiting for selector "#x"')).toBe('likely-drift');
    expect(classifyFailure('strict mode violation: multiple elements')).toBe('likely-drift');
  });

  it('flags assertion mismatches as likely-regression', () => {
    expect(classifyFailure('assertion failed while comparing')).toBe('likely-regression');
    expect(classifyFailure('expect(x).toBe(1)')).toBe('likely-regression');
  });

  it('returns unknown for unrelated output', () => {
    expect(classifyFailure('just some ordinary log line')).toBe('unknown');
  });

  it('prefers not-implemented over drift when both signals appear', () => {
    // A dead route often also produces a selector-timeout; the more specific cause wins.
    expect(classifyFailure('404 Not Found — then waiting for selector "#login" timed out')).toBe('possibly-not-implemented');
  });
});
