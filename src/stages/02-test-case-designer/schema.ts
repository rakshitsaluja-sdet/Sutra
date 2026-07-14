import { z } from 'zod';

export const TestStepSchema = z.object({
  step: z.string(),
  expectedResult: z.string(),
});

export const TestCaseSchema = z.object({
  id: z.string().describe('Short local id, e.g. TC-1'),
  title: z.string(),
  category: z.enum(['positive', 'negative', 'edge', 'boundary']),
  priority: z.enum(['high', 'medium', 'low']),
  preconditions: z.string().optional(),
  steps: z.array(TestStepSchema).min(1),
});

export const TestCaseDesignerOutputSchema = z.object({
  testCases: z.array(TestCaseSchema).min(1),
});

export type TestStep = z.infer<typeof TestStepSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type TestCaseDesignerOutput = z.infer<typeof TestCaseDesignerOutputSchema>;
