import { z } from 'zod';

export const GeneratedFileSchema = z.object({
  relativePath: z
    .string()
    .describe('Path relative to generated/, e.g. "features/2-1-successful-login/tc-1/login.feature" — feature files use the given Stable path key, not the Xray key'),
  content: z.string(),
});

export const ScriptGeneratorOutputSchema = z.object({
  cannotGround: z
    .object({ reason: z.string() })
    .nullable()
    .describe(
      'Escape hatch. Set this (with a concrete reason) and leave the file fields null ONLY if, after actually navigating the real target app, the feature under test is not present / not implemented / not reachable, so a script cannot be honestly grounded. Never fabricate selectors to avoid using this. Otherwise set to null.',
    ),
  featureFile: GeneratedFileSchema.nullable(),
  stepDefinitionsFile: GeneratedFileSchema.nullable(),
  pageObjectFile: GeneratedFileSchema.nullable(),
  utilFiles: z.array(GeneratedFileSchema),
  reusedExistingFiles: z
    .array(z.string())
    .describe('Relative paths of existing step-def/util/page-object files reused rather than duplicated'),
  groundingNotes: z.string().describe('What was actually observed in the real target app while authoring this script'),
});

export type GeneratedFile = z.infer<typeof GeneratedFileSchema>;
export type ScriptGeneratorOutput = z.infer<typeof ScriptGeneratorOutputSchema>;
