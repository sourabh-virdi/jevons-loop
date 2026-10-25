import { supportDataset } from "@/domains/support/dataset";
import {
  supportContextPolicy,
  supportGuardrailPolicy,
  supportRouterPolicy,
  supportVerifierPolicy,
  reorderChunks,
} from "@/domains/support/policy";
import { supportPrompts, supportTemplates } from "@/domains/support/prompts";
import { supportDefaultThresholds, supportGating, supportQuestions } from "@/domains/support/questions";
import { supportTools } from "@/domains/support/tools";
import { bindChunks } from "@/domains/bind-chunks";
import type { DomainPack } from "@/domains/types";

export const supportPack: DomainPack = {
  id: "support",
  displayName: "Banking support",
  description: "Customer-support agent over Banking77 intents, synthetic FAQs, and mock account tools.",
  dataset: supportDataset,
  corpus: { dir: "src/domains/support/corpus", chunkSize: 800, chunkOverlap: 100 },
  tools: supportTools,
  prompts: supportPrompts,
  templates: supportTemplates,
  samplePrompts: [
    "I still haven't received the card I ordered last week.",
    "Show my recent transactions [tool]",
    "Please freeze my card ending 4242 [tool]",
    "Why was I charged a fee on my last transfer?",
    "My top up is still pending from this morning.",
    "Can you explain how to verify my identity in the app?",
  ],
  checkpoints: {
    guardrail: {
      questions: supportQuestions.guardrail,
      gatingQuestions: [...supportGating.guardrail],
      defaultThresholds: supportDefaultThresholds.guardrail,
      buildState: (state) => ({ query: state.query }),
      policy: (answers) => supportGuardrailPolicy(answers),
    },
    router: {
      questions: supportQuestions.router,
      gatingQuestions: [...supportGating.router],
      defaultThresholds: supportDefaultThresholds.router,
      buildState: (state) => ({ query: state.effectiveQuery || state.query }),
      policy: (answers) => supportRouterPolicy(answers),
    },
    contextCheck: {
      questions: supportQuestions.contextCheck,
      gatingQuestions: [...supportGating.contextCheck],
      defaultThresholds: supportDefaultThresholds.contextCheck,
      buildState: (state) => ({
        query: state.effectiveQuery || state.query,
        rewriteCount: state.rewriteCount,
        chunks: state.chunks.slice(0, 8).map((chunk) => ({ id: chunk.id, text: chunk.text })),
      }),
      resolveQuestions: (state) => bindChunks(supportQuestions.contextCheck, state.chunks),
      policy: supportContextPolicy,
    },
    verifier: {
      questions: supportQuestions.verifier,
      gatingQuestions: [...supportGating.verifier],
      defaultThresholds: supportDefaultThresholds.verifier,
      buildState: (state) => ({
        query: state.query,
        draft: state.draft,
        regenCount: state.regenCount,
        context: state.chunks.map((chunk) => chunk.text).join("\n"),
      }),
      policy: supportVerifierPolicy,
    },
  },
};

export { reorderChunks };
