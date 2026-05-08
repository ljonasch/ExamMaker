import OpenAI from "openai";
import { z } from "zod";
import { DEFAULT_MODEL } from "./constants";
import { recordUsageFromApiResponse, type OperationGroup, type UsageScope } from "./usage";

export async function parseOrRepairJson<T>(
  text: string,
  schema: z.ZodType<T>,
  openai?: OpenAI,
  model = DEFAULT_MODEL,
  usageContext?: {
    scope?: UsageScope;
    operationGroup: OperationGroup;
    metadata?: Record<string, unknown>;
  }
): Promise<T> {
  const parsed = tryParse(text, schema);
  if (parsed.ok) return parsed.value;
  if (!openai) {
    throw new Error(parsed.error);
  }

  const repaired = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "Return only repaired valid JSON that satisfies the validation rules. Do not add markdown." },
      { role: "user", content: `Repair this JSON only.\nValidation errors:\n${parsed.error}\n\nJSON:\n${text}` }
    ],
    response_format: { type: "json_object" }
  });
  if (usageContext?.scope) {
    await recordUsageFromApiResponse(repaired, {
      ...usageContext.scope,
      operationGroup: usageContext.operationGroup,
      operationName: "json_repair",
      model,
      metadata: usageContext.metadata
    });
  }

  const content = repaired.choices[0]?.message?.content || "";
  const repairedParsed = tryParse(content, schema);
  if (!repairedParsed.ok) {
    throw new Error(`OpenAI returned invalid JSON: ${repairedParsed.error}`);
  }
  return repairedParsed.value;
}

function tryParse<T>(text: string, schema: z.ZodType<T>) {
  try {
    const value = JSON.parse(text);
    return { ok: true as const, value: schema.parse(value) };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Unknown JSON parse error"
    };
  }
}
