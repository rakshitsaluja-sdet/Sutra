import { z } from 'zod';

export const GeneratedFileSchema = z.object({
  relativePath: z.string().describe('Path relative to generated/, e.g. "features/tc-1/login.feature"'),
  content: z.string(),
});

export const ScriptGeneratorOutputSchema = z.object({
  featureFile: GeneratedFileSchema,
  stepDefinitionsFile: GeneratedFileSchema,
  pageObjectFile: GeneratedFileSchema.nullable(),
  utilFiles: z.array(GeneratedFileSchema),
  reusedExistingFiles: z
    .array(z.string())
    .describe('Relative paths of existing step-def/util/page-object files reused rather than duplicated'),
  groundingNotes: z.string().describe('What was actually observed in the real target app while authoring this script'),
});

export type GeneratedFile = z.infer<typeof GeneratedFileSchema>;
export type ScriptGeneratorOutput = z.infer<typeof ScriptGeneratorOutputSchema>;
