import { getEnv } from "@/config/env";
import type { DomainPack } from "@/domains/types";
import { emitStep, readConfigurable } from "@/graph/runtime";
import type { GraphState } from "@/graph/state";
import { createLlmClient } from "@/engines/llm/client";

export function makeFinalize(pack: DomainPack) {
  return async (state: GraphState, config: { configurable?: Record<string, unknown> }) => {
    const started = Date.now();
    let outcome = state.outcome || "answer";
    let text = state.draft;
    if (state.guardrailEdge === "blocked") {
      outcome = "blocked";
      text = pack.templates.blocked;
    } else if (state.routerEdge === "handoff" || state.verifierEdge === "handoff") {
      outcome = "handoff";
      text = `${pack.templates.handoff}\n\n${state.draft}`.trim();
    } else if (state.routerEdge === "clarify" || state.contextEdge === "clarify") {
      outcome = "clarify";
      const llm = readConfigurable(config).llm ?? createLlmClient();
      const generated = await llm.generate({
        model: getEnv().LLM_MODEL,
        system: `${pack.prompts.system}\nAsk a clarifying question.`,
        prompt: `${pack.prompts.clarify}\n\nQuery: ${state.query}`,
      });
      text = generated.text;
    } else {
      outcome = "answer";
      text = state.draft || "I could not produce an answer from the available context.";
    }
    if (state.secretsWarning) text = `${state.secretsWarning}\n\n${text}`;
    const step = emitStep(state, config, "finalize", started, text);
    return {
      outcome,
      finalResponse: text,
      steps: [step],
    };
  };
}
