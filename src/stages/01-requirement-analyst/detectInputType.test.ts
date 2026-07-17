import { describe, expect, it } from 'vitest';
import { detectInputType } from './detectInputType.js';

describe('detectInputType', () => {
  it('classifies a short "As a ... I want ... so that ..." passage as a user story', () => {
    expect(detectInputType('As a registered user, I want to reset my password, so that I can regain access.')).toBe('user-story');
  });

  it('classifies prose without the story shape as a BRD', () => {
    expect(detectInputType('The system shall allow users to authenticate using email and password.')).toBe('brd');
  });

  it('treats a long document as a BRD even if it contains a story-like sentence', () => {
    const long = 'As a user I want X so that Y. ' + 'requirement detail. '.repeat(250);
    expect(detectInputType(long)).toBe('brd');
  });

  it('treats many story markers as a BRD (needs decomposition, not normalization)', () => {
    const many = Array.from({ length: 7 }, (_, i) => `As a user I want feature ${i} so that benefit ${i}.`).join('\n');
    expect(detectInputType(many)).toBe('brd');
  });
});
