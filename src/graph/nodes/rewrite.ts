import { getEnv } from "@/config/env";
import type { DomainPack } from "@/domains/types";
import { emitStep, readConfigurable } from "@/graph/runtime";
import type { GraphState } from "@/graph/state";
import { createLlmClient } from "@/engines/llm/client";

export function makeRewrite(pack: DomainPack) {
  return async (state: GraphState, config: { configurable?: Record<string, unknown> }) => {
    const started = Date.now();
    const llm = readConfigurable(config).llm ?? createLlmClient();
    const result = await llm.generate({
      model: getEnv().LLM_MODEL,
      system: pack.prompts.system,
      prompt: `${pack.prompts.rewrite}\n\nQuery: ${state.query}`,
    });
    const step = emitStep(state, config, "rewrite", started, result.text, result.costUsd);
    return {
      effectiveQuery: result.text.trim() || state.query,
      rewriteCount: state.rewriteCount + 1,
      steps: [step],
      costUsd: state.costUsd + result.costUsd,
      generationCalls: state.generationCalls + 1,
    };
  };
}
