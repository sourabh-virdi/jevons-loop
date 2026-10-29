import type { DomainPack } from "@/domains/types";
import { emitStep } from "@/graph/runtime";
import type { GraphState } from "@/graph/state";

export function makeTool(pack: DomainPack) {
  return async (state: GraphState, config: { configurable?: Record<string, unknown> }) => {
    const started = Date.now();
    const tool = pack.tools.find((item) => item.name === state.toolName) ?? pack.tools.find((item) => !item.sideEffect);
    let output = "No matching mock tool.";
    if (tool) {
      const last4 = state.query.match(/\b(\d{4})\b/)?.[1];
      const input = tool.sideEffect
        ? { summary: state.query.slice(0, 180), confirmed: false, last4, query: state.query.slice(0, 80) }
        : { last4, query: state.effectiveQuery || state.query, component: undefined };
      try {
        output = JSON.stringify(tool.execute(input));
      } catch (error) {
        output = error instanceof Error ? error.message : "Tool input was rejected.";
      }
    }
    const step = emitStep(state, config, "tool", started, output);
    return {
      toolResult: output,
      steps: [step],
      pendingConfirmation: output.includes("confirmation_required"),
    };
  };
}
