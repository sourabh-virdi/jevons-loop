import { CHECKPOINT_DEFAULTS } from "@/config/constants";
import type { CheckpointName, NormalizedAnswer } from "@/types/contracts";

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Choice and score use the reported confidence. Noul confidence is max(p, 1-p). */
export function confidenceFor(answer: NormalizedAnswer | undefined): number {
  if (!answer) return 0;
  if (answer.type === "noul") return clamp01(Math.max(answer.probability, 1 - answer.probability));
  return clamp01(answer.confidence);
}

export function checkpointConfidence(
  answers: Record<string, NormalizedAnswer>,
  gatingQuestions: readonly string[],
): number {
  if (gatingQuestions.length === 0) return 1;
  return Math.min(...gatingQuestions.map((question) => confidenceFor(answers[question])));
}

export function resolveThresholds(
  checkpoint: CheckpointName,
  gatingQuestions: readonly string[],
  defaults: Record<string, number>,
  overrides?: Record<string, number>,
): Record<string, number> {
  const resolved: Record<string, number> = {};
  for (const question of gatingQuestions) {
    resolved[question] =
      overrides?.[question] ?? defaults[question] ?? CHECKPOINT_DEFAULTS[checkpoint];
  }
  return resolved;
}

export function escalationReasons(
  checkpoint: CheckpointName,
  answers: Record<string, NormalizedAnswer>,
  gatingQuestions: readonly string[],
  thresholds: Record<string, number>,
): string[] {
  const reasons: string[] = [];
  for (const question of gatingQuestions) {
    const confidence = confidenceFor(answers[question]);
    const threshold = thresholds[question] ?? 1;
    if (confidence < threshold) {
      reasons.push(
        `${checkpoint}.${question} confidence ${confidence.toFixed(2)} < ${threshold.toFixed(2)}`,
      );
    }
  }
  return reasons;
}

export function answersDisagree(
  left: Record<string, NormalizedAnswer>,
  right: Record<string, NormalizedAnswer>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const a = left[key];
    const b = right[key];
    if (!a || !b || a.type !== b.type) return true;
    if (a.type === "noul" && b.type === "noul" && Math.abs(a.probability - b.probability) > 0.05) return true;
    if (a.type === "choice" && b.type === "choice" && a.choice !== b.choice) return true;
    if (a.type === "score" && b.type === "score" && a.bucket !== b.bucket) return true;
  }
  return false;
}
