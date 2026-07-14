import { z } from 'zod';

export const AcceptanceCriterionSchema = z.object({
  id: z.string().describe('Short local id, e.g. AC-1'),
  text: z.string().describe('A clear, testable statement'),
});

export const UserStorySchema = z.object({
  id: z.string().describe('Short local id, e.g. US-1'),
  title: z.string(),
  actor: z.string().describe('The "As a <actor>" role'),
  goal: z.string().describe('The "I want <goal>" clause'),
  benefit: z.string().describe('The "so that <benefit>" clause'),
  type: z.enum(['functional', 'technical']),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema).min(1),
  sourceExcerpt: z.string().describe('The exact source text this story was derived from — required for traceability'),
});

export const RequirementAnalystOutputSchema = z.object({
  stories: z.array(UserStorySchema).min(1),
});

export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;
export type UserStory = z.infer<typeof UserStorySchema>;
export type RequirementAnalystOutput = z.infer<typeof RequirementAnalystOutputSchema>;
