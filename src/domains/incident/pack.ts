import { incidentDataset } from "@/domains/incident/dataset";
import {
  incidentContextPolicy,
  incidentGuardrailPolicy,
  incidentRouterPolicy,
  incidentVerifierPolicy,
} from "@/domains/incident/policy";
import { incidentPrompts, incidentTemplates } from "@/domains/incident/prompts";
import { incidentDefaultThresholds, incidentGating, incidentQuestions } from "@/domains/incident/questions";
import { incidentTools } from "@/domains/incident/tools";
import { bindChunks } from "@/domains/bind-chunks";
import type { DomainPack } from "@/domains/types";

export const incidentPack: DomainPack = {
  id: "incident",
  displayName: "Incident triage",
  description: "IT incident triage over LogHub-style windows, synthetic runbooks, and mock ops tools.",
  dataset: incidentDataset,
  corpus: { dir: "src/domains/incident/corpus", chunkSize: 1000, chunkOverlap: 150 },
  tools: incidentTools,
  prompts: incidentPrompts,
  templates: incidentTemplates,
  samplePrompts: [
    "FATAL memory parity error on compute node R02. Users cannot start jobs.",
    "HDFS datanode heartbeat lost for block blk_123. Replication is under-replicated.",
    "Search logs for link flap [logs]",
    "Intermittent network link flaps between racks, jobs are slow.",
  ],
  checkpoints: {
    guardrail: {
      questions: incidentQuestions.guardrail,
      gatingQuestions: [...incidentGating.guardrail],
      defaultThresholds: incidentDefaultThresholds.guardrail,
      buildState: (state) => ({ query: state.query }),
      policy: (answers) => incidentGuardrailPolicy(answers),
    },
    router: {
      questions: incidentQuestions.router,
      gatingQuestions: [...incidentGating.router],
      defaultThresholds: incidentDefaultThresholds.router,
      buildState: (state) => ({ query: state.effectiveQuery || state.query }),
      policy: (answers) => incidentRouterPolicy(answers),
    },
    contextCheck: {
      questions: incidentQuestions.contextCheck,
      gatingQuestions: [...incidentGating.contextCheck],
      defaultThresholds: incidentDefaultThresholds.contextCheck,
      buildState: (state) => ({
        query: state.effectiveQuery || state.query,
        rewriteCount: state.rewriteCount,
        chunks: state.chunks.slice(0, 8).map((chunk) => ({ id: chunk.id, text: chunk.text })),
      }),
      resolveQuestions: (state) => bindChunks(incidentQuestions.contextCheck, state.chunks),
      policy: incidentContextPolicy,
    },
    verifier: {
      questions: incidentQuestions.verifier,
      gatingQuestions: [...incidentGating.verifier],
      defaultThresholds: incidentDefaultThresholds.verifier,
      buildState: (state) => ({
        query: state.query,
        draft: state.draft,
        regenCount: state.regenCount,
        context: state.chunks.map((chunk) => chunk.text).join("\n"),
      }),
      policy: incidentVerifierPolicy,
    },
  },
};
