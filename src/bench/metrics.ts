import { mulberry32 } from "@/lib/rng";

export interface ClassPrediction {
  gold: string;
  pred: string;
}

export interface BinaryPrediction {
  gold: boolean;
  pred: boolean;
}

export interface CalibrationPoint {
  confidence: number;
  correct: boolean;
}

export interface ReliabilityBin {
  bin: number;
  lower: number;
  upper: number;
  count: number;
  confidence: number;
  accuracy: number;
}

export function accuracy(pairs: ClassPrediction[]): number {
  if (pairs.length === 0) return 0;
  return pairs.filter((pair) => pair.gold === pair.pred).length / pairs.length;
}

export function binaryAccuracy(pairs: BinaryPrediction[]): number {
  if (pairs.length === 0) return 0;
  return pairs.filter((pair) => pair.gold === pair.pred).length / pairs.length;
}

export function macroF1(pairs: ClassPrediction[]): number {
  const labels = [...new Set(pairs.flatMap((pair) => [pair.gold, pair.pred]))];
  if (labels.length === 0) return 0;
  const scores = labels.map((label) => f1For(label, pairs));
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function f1For(label: string, pairs: ClassPrediction[]): number {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const pair of pairs) {
    if (pair.pred === label && pair.gold === label) tp += 1;
    else if (pair.pred === label && pair.gold !== label) fp += 1;
    else if (pair.pred !== label && pair.gold === label) fn += 1;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

export function binaryF1(pairs: BinaryPrediction[], positive = true): { precision: number; recall: number; f1: number } {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const pair of pairs) {
    if (pair.pred === positive && pair.gold === positive) tp += 1;
    else if (pair.pred === positive && pair.gold !== positive) fp += 1;
    else if (pair.pred !== positive && pair.gold === positive) fn += 1;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

export function meanAbsoluteError(pairs: Array<{ gold: number; pred: number }>): number {
  if (pairs.length === 0) return 0;
  return pairs.reduce((sum, pair) => sum + Math.abs(pair.gold - pair.pred), 0) / pairs.length;
}

export function exactMatch(pairs: Array<{ gold: number; pred: number }>): number {
  if (pairs.length === 0) return 0;
  return pairs.filter((pair) => pair.gold === pair.pred).length / pairs.length;
}

/** Expected Calibration Error over 10 equal-width bins. */
export function expectedCalibrationError(points: CalibrationPoint[], bins = 10): number {
  const diagram = reliabilityDiagram(points, bins);
  const total = points.length;
  if (total === 0) return 0;
  return diagram.reduce((sum, bin) => sum + (bin.count / total) * Math.abs(bin.accuracy - bin.confidence), 0);
}

export function brierScore(points: CalibrationPoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((sum, point) => sum + (point.confidence - (point.correct ? 1 : 0)) ** 2, 0) / points.length;
}

export function reliabilityDiagram(points: CalibrationPoint[], bins = 10): ReliabilityBin[] {
  const groups: CalibrationPoint[][] = Array.from({ length: bins }, () => []);
  for (const point of points) {
    const index = Math.min(bins - 1, Math.max(0, Math.floor(point.confidence * bins)));
    groups[index]?.push(point);
  }
  return groups.map((group, index) => {
    const count = group.length;
    const confidence = count === 0 ? 0 : group.reduce((sum, point) => sum + point.confidence, 0) / count;
    const accuracy = count === 0 ? 0 : group.filter((point) => point.correct).length / count;
    return {
      bin: index,
      lower: index / bins,
      upper: (index + 1) / bins,
      count,
      confidence,
      accuracy,
    };
  });
}

/** Nearest-rank percentile. Empty input returns null so cached-only runs do not invent latency. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

export function bootstrapMeanCi(
  values: number[],
  iterations = 1000,
  seed = 1,
  alpha = 0.05,
): { mean: number; low: number; high: number } {
  if (values.length === 0) return { mean: 0, low: 0, high: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const rand = mulberry32(seed);
  const means: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    let total = 0;
    for (let j = 0; j < values.length; j += 1) {
      const index = Math.floor(rand() * values.length);
      total += values[index] ?? 0;
    }
    means.push(total / values.length);
  }
  means.sort((a, b) => a - b);
  const lowIndex = Math.max(0, Math.floor((alpha / 2) * means.length));
  const highIndex = Math.min(means.length - 1, Math.ceil((1 - alpha / 2) * means.length) - 1);
  return { mean, low: means[lowIndex] ?? mean, high: means[highIndex] ?? mean };
}

export function costPerThousand(totalCost: number, requests: number): number {
  if (requests <= 0) return 0;
  return (totalCost / requests) * 1000;
}

export function llmCallsAvoided(hybridLlmDecisionCalls: number, baselineLlmDecisionCalls: number): number {
  if (baselineLlmDecisionCalls <= 0) return 0;
  return 1 - hybridLlmDecisionCalls / baselineLlmDecisionCalls;
}

export interface ParetoPoint {
  threshold: number;
  accuracy: number;
  cost: number;
  escalationRate: number;
}

/** A point is on the frontier when no other point is both cheaper and more accurate. */
export function paretoFrontier(points: ParetoPoint[]): ParetoPoint[] {
  return points.filter((point) => {
    return !points.some(
      (other) =>
        other !== point &&
        other.cost <= point.cost &&
        other.accuracy >= point.accuracy &&
        (other.cost < point.cost || other.accuracy > point.accuracy),
    );
  });
}

export function chooseThreshold(
  points: ParetoPoint[],
  baselineAccuracy: number,
  tolerance = 0.01,
): ParetoPoint | undefined {
  const eligible = points
    .filter((point) => point.accuracy + 1e-9 >= baselineAccuracy - tolerance)
    .sort((a, b) => a.cost - b.cost || b.accuracy - a.accuracy);
  return eligible[0];
}
