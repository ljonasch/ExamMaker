import { COST_LIMIT_USD, DEFAULT_MODEL, MAX_OUTPUT_TOKENS } from "./constants";
import { estimateUsageCost } from "./usage";

export function estimateTokensFromChars(chars: number) {
  return Math.ceil(chars / 4);
}

export function estimateExamCost(contextChars: number, outputTokens = MAX_OUTPUT_TOKENS, model = DEFAULT_MODEL) {
  const inputTokens = estimateTokensFromChars(contextChars);
  const estimatedUsd = estimateUsageCost({
    model,
    inputTokens,
    outputTokens
  });
  return {
    inputTokens,
    outputTokens,
    estimatedUsd: Number(estimatedUsd.toFixed(4)),
    exceedsLimit: estimatedUsd > COST_LIMIT_USD
  };
}
