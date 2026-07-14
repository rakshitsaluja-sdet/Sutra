import { query, type McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

export interface RunAgentInput<T> {
  /** Used only for logging/error context, e.g. "requirement-analyst". */
  stageName: string;
  prompt: string;
  systemPrompt: string;
  schema: z.ZodType<T>;
  model: string;
  mcpServers?: Record<string, McpServerConfig>;
  allowedTools?: string[];
  maxTurns?: number;
}

/**
 * Uniform call path every stage's LLM work goes through: structured-output
 * generation, validated against the stage's own zod schema before anything
 * downstream is allowed to trust it. Runs headless (bypassPermissions) since
 * this is an unattended CI pipeline, not an interactive session.
 */
export async function runAgent<T>(input: RunAgentInput<T>): Promise<T> {
  const jsonSchema = z.toJSONSchema(input.schema) as Record<string, unknown>;
  // The CLI's --json-schema validator rejects a top-level $schema key
  // ("no schema with key or ref ...") — strip it, the rest of the schema is fine.
  delete jsonSchema.$schema;

  const stream = query({
    prompt: input.prompt,
    options: {
      systemPrompt: input.systemPrompt,
      model: input.model,
      mcpServers: input.mcpServers,
      allowedTools: input.allowedTools ?? [],
      maxTurns: input.maxTurns ?? 6,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      outputFormat: { type: 'json_schema', schema: jsonSchema },
    },
  });

  let resultMessage: Awaited<ReturnType<typeof stream.next>>['value'] | undefined;
  for await (const message of stream) {
    if (message.type === 'result') {
      resultMessage = message;
    } else if (message.type === 'assistant') {
      logger.debug({ stage: input.stageName }, 'agent turn');
    }
  }

  if (!resultMessage || resultMessage.type !== 'result') {
    throw new Error(`[${input.stageName}] agent produced no result message`);
  }

  if (resultMessage.subtype !== 'success') {
    throw new Error(
      `[${input.stageName}] agent run failed (${resultMessage.subtype}): ${resultMessage.errors?.join('; ') ?? 'no error detail'}`,
    );
  }

  const parsed = input.schema.safeParse(resultMessage.structured_output);
  if (!parsed.success) {
    throw new Error(
      `[${input.stageName}] structured output failed schema validation:\n${parsed.error.message}\n\nRaw: ${JSON.stringify(resultMessage.structured_output)}`,
    );
  }

  logger.info(
    { stage: input.stageName, costUsd: resultMessage.total_cost_usd, turns: resultMessage.num_turns },
    'agent run complete',
  );

  return parsed.data;
}
