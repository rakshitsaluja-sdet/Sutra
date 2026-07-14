export type InputType = 'brd' | 'user-story';

const USER_STORY_PATTERN = /\bas an?\s+.+?,?\s+I\s+(want|need|would like)\s+.+?(so that|in order to)\s+.+/is;

/**
 * Heuristic classifier, not an LLM call — cheap and deterministic for the common
 * case. A short passage that is essentially one or a few "As a ... I want ...
 * so that ..." statements is treated as already-written user stories (normalize
 * only, never invent new scope). Anything longer or without that shape is
 * treated as a BRD needing decomposition into multiple stories.
 */
export function detectInputType(rawText: string): InputType {
  const trimmed = rawText.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const storyMarkerCount = (trimmed.match(/\bas an?\s+/gi) ?? []).length;
  const looksLikeStory = USER_STORY_PATTERN.test(trimmed);

  if (looksLikeStory && wordCount < 400 && storyMarkerCount > 0 && storyMarkerCount <= 5) {
    return 'user-story';
  }
  return 'brd';
}
