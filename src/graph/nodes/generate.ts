import { getEnv } from "@/config/env";
import type { DomainPack } from "@/domains/types";
import { emitStep, readConfigurable } from "@/graph/runtime";
import type { GraphState } from "@/graph/state";
import { createLlmClient } from "@/engines/llm/client";

export function makeGenerate(pack: DomainPack) {
  return async (state: GraphState, config: { configurable?: Record<string, unknown> }) => {
    const started = Date.now();
    const llm = readConfigurable(config).llm ?? createLlmClient();
    const context = state.chunks.map((chunk, index) => `[${index}] ${chunk.text}`).join("\n\n");
    const prompt = [
      pack.prompts.generate,
      `Question: ${state.query}`,
      state.toolResult ? `Tool result: ${state.toolResult}` : "",
      `Context:\n${context || "No context retrieved."}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const sink = readConfigurable(config).sink;
    const result = await llm.generate({
      model: getEnv().LLM_MODEL,
      system: pack.prompts.system,
      prompt,
      onToken: (token) => sink?.token(token),
    });
    const step = emitStep(state, config, "generate", started, result.text, result.costUsd);
    return {
      draft: result.text,
      regenCount: state.draft ? state.regenCount + 1 : state.regenCount,
      steps: [step],
      costUsd: state.costUsd + result.costUsd,
      generationCalls: state.generationCalls + 1,
    };
  };
}
