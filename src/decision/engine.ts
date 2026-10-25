import { escalationReasons, resolveThresholds, answersDisagree } from "@/decision/confidence";
import type { ModelCache } from "@/decision/cache";
import { enforceTokenBudget } from "@/lib/tokens";
import { cacheKey, sha256 } from "@/lib/hash";
import { preview } from "@/lib/redact";
import { log } from "@/lib/logger";
import type { JevClient, LlmClient } from "@/engines/types";
import type { QuestionSet } from "@/engines/jev/types";
import type {
  CheckpointName,
  CheckpointOutcome,
  DecisionResult,
  DecisionTrace,
  Mode,
  NormalizedAnswer,
} from "@/types/contracts";

export interface CheckpointLike<S> {
  questions: QuestionSet;
  gatingQuestions: string[];
  buildState: (state: S) => unknown;
  policy: (answers: Record<string, NormalizedAnswer>, state: S) => CheckpointOutcome;
  defaultThresholds: Record<string, number>;
  resolveQuestions?: (state: S) => QuestionSet;
}

export interface DecideInput<S> {
  requestId: string;
  runId?: string;
  domainId: string;
  mode: Mode;
  checkpoint: CheckpointName;
  attempt: number;
  state: S;
  config: CheckpointLike<S>;
  thresholdOverrides?: Record<string, number>;
  jevModel: string;
  llmModel: string;
}

export class DecisionEngine {
  constructor(
    private readonly options: {
      jev: JevClient;
      llm: LlmClient;
      cache: ModelCache;
      tokenBudget: number;
      cacheEnabled: boolean;
    },
  ) {}

  async decide<S>(input: DecideInput<S>): Promise<{
    outcome: CheckpointOutcome;
    trace: DecisionTrace;
    answers: Record<string, NormalizedAnswer>;
  }> {
    const questions = input.config.resolveQuestions?.(input.state) ?? input.config.questions;
    const bounded = enforceTokenBudget(input.config.buildState(input.state), this.options.tokenBudget);
    const thresholds = resolveThresholds(
      input.checkpoint,
      input.config.gatingQuestions,
      input.config.defaultThresholds,
      input.thresholdOverrides,
    );
    const stateHash = sha256(JSON.stringify(bounded));
    let primary: DecisionResult;
    let fallback: DecisionResult | undefined;
    let escalated = false;
    let escalationReason: string | undefined;

    if (input.mode === "baseline") {
      primary = await this.cachedCall("llm", input.llmModel, bounded, questions, () =>
        this.options.llm.decide({ model: input.llmModel, state: bounded, questions }),
      );
    } else {
      try {
        primary = await this.cachedCall("jev", input.jevModel, bounded, questions, () =>
          this.options.jev.decide({ model: input.jevModel, state: bounded, questions }),
        );
      } catch (error) {
        if (input.mode !== "hybrid") throw error;
        escalated = true;
        escalationReason = "jev_error";
        log("warn", "jev checkpoint failed; cascading to llm", {
          requestId: input.requestId,
          checkpoint: input.checkpoint,
        });
        fallback = await this.cachedCall("llm", input.llmModel, bounded, questions, () =>
          this.options.llm.decide({ model: input.llmModel, state: bounded, questions }),
        );
        primary = failedPrimary(input.jevModel, error);
      }
    }

    let answers = fallback?.answers ?? primary.answers;
    if (!escalated && input.mode === "hybrid") {
      const reasons = escalationReasons(input.checkpoint, primary.answers, input.config.gatingQuestions, thresholds);
      if (reasons.length > 0) {
        escalated = true;
        escalationReason = reasons.join("; ");
        fallback = await this.cachedCall("llm", input.llmModel, bounded, questions, () =>
          this.options.llm.decide({ model: input.llmModel, state: bounded, questions }),
        );
        answers = fallback.answers;
      }
    }

    const outcome = input.config.policy(answers, input.state);
    const trace: DecisionTrace = {
      requestId: input.requestId,
      runId: input.runId,
      domainId: input.domainId,
      mode: input.mode,
      checkpoint: input.checkpoint,
      attempt: input.attempt,
      primary,
      fallback,
      escalated,
      escalationReason,
      outcome: outcome.edge,
      stateHash,
      timestamp: new Date().toISOString(),
      disagreement: fallback ? answersDisagree(primary.answers, fallback.answers) : false,
      statePreview: preview(bounded),
      thresholds,
    };
    return { outcome, trace, answers };
  }

  private async cachedCall(
    engine: "jev" | "llm",
    model: string,
    state: unknown,
    questions: QuestionSet,
    call: () => Promise<DecisionResult>,
  ): Promise<DecisionResult> {
    const hash = cacheKey({ engine, model, state, questions });
    if (this.options.cacheEnabled) {
      const hit = this.options.cache.get(hash);
      if (hit) return hit;
    }
    const result = await call();
    if (this.options.cacheEnabled) this.options.cache.set(hash, result);
    return result;
  }
}

function failedPrimary(model: string, error: unknown): DecisionResult {
  return {
    engine: "jev",
    answers: {},
    latencyMs: 0,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    rawModelId: model,
    cacheHit: false,
    error: error instanceof Error ? error.message : "jev_error",
  };
}
