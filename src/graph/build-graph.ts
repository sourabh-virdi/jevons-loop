import { END, START, StateGraph } from "@langchain/langgraph";
import type { DomainPack } from "@/domains/types";
import { GraphAnnotation, type GraphState } from "@/graph/state";
import { makeContextCheck } from "@/graph/nodes/contextCheck";
import { makeFinalize } from "@/graph/nodes/finalize";
import { makeGenerate } from "@/graph/nodes/generate";
import { makeGuardrail } from "@/graph/nodes/guardrail";
import { makeRetrieve } from "@/graph/nodes/retrieve";
import { makeRewrite } from "@/graph/nodes/rewrite";
import { makeRouter } from "@/graph/nodes/router";
import { makeTool } from "@/graph/nodes/tool";
import { makeVerify } from "@/graph/nodes/verify";

export function buildGraph(pack: DomainPack) {
  const graph = new StateGraph(GraphAnnotation)
    .addNode("guardrail", makeGuardrail(pack))
    .addNode("router", makeRouter(pack))
    .addNode("tool", makeTool(pack))
    .addNode("retrieve", makeRetrieve(pack))
    .addNode("contextCheck", makeContextCheck(pack))
    .addNode("rewrite", makeRewrite(pack))
    .addNode("generate", makeGenerate(pack))
    .addNode("verify", makeVerify(pack))
    .addNode("finalize", makeFinalize(pack))
    .addEdge(START, "guardrail")
    .addConditionalEdges("guardrail", (state: GraphState) => state.guardrailEdge, {
      blocked: "finalize",
      pass: "router",
    })
    .addConditionalEdges("router", (state: GraphState) => state.routerEdge, {
      tool: "tool",
      answer: "retrieve",
      clarify: "finalize",
      handoff: "finalize",
    })
    .addEdge("tool", "retrieve")
    .addEdge("retrieve", "contextCheck")
    .addConditionalEdges("contextCheck", (state: GraphState) => state.contextEdge, {
      sufficient: "generate",
      rewrite: "rewrite",
      clarify: "finalize",
    })
    .addEdge("rewrite", "retrieve")
    .addEdge("generate", "verify")
    .addConditionalEdges("verify", (state: GraphState) => state.verifierEdge, {
      pass: "finalize",
      regenerate: "generate",
      handoff: "finalize",
    })
    .addEdge("finalize", END);
  return graph.compile();
}
