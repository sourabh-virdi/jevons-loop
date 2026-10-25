import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { BANKING_INTENTS, familyForIntent } from "@/domains/support/intents";
import type { DatasetAdapter, DatasetExample } from "@/domains/types";
import { sampleSeeded } from "@/lib/rng";
import type { Split } from "@/types/contracts";

const RowSchema = z.object({ text: z.string().min(1), label: z.string().min(1) });

const VALIDATION_SEED = 77;

export function loadSupportRows(): { train: DatasetExample[]; test: DatasetExample[] } {
  const downloadedTrain = resolve("data/datasets/banking77/train.json");
  const downloadedTest = resolve("data/datasets/banking77/test.json");
  if (existsSync(downloadedTrain) && existsSync(downloadedTest)) {
    return {
      train: readRows(downloadedTrain, "train"),
      test: readRows(downloadedTest, "test"),
    };
  }
  const sample = BANKING_INTENTS.map((intent, index) => ({
    id: `sample-${index}`,
    text: intent.utterance,
    gold: { intent: intent.id, family: intent.family },
  }));
  const shuffled = sampleSeeded(sample, sample.length, VALIDATION_SEED);
  const testCount = Math.max(1, Math.round(sample.length * 0.2));
  return { test: shuffled.slice(0, testCount), train: shuffled.slice(testCount) };
}

export function carveSupportSplits(): Record<Split, DatasetExample[]> {
  const { train, test } = loadSupportRows();
  const shuffled = sampleSeeded(train, train.length, VALIDATION_SEED);
  const validationCount = Math.max(1, Math.round(shuffled.length * 0.2));
  return {
    validation: shuffled.slice(0, validationCount),
    train: shuffled.slice(validationCount),
    test,
  };
}

export const supportDataset: DatasetAdapter = {
  load(split) {
    return carveSupportSplits()[split];
  },
};

function readRows(path: string, prefix: string): DatasetExample[] {
  const rows = z.array(RowSchema).parse(JSON.parse(readFileSync(path, "utf8")));
  return rows
    .map((row, index) => ({
      id: `${prefix}-${index}`,
      text: row.text,
      gold: { intent: row.label, family: familyForIntent(row.label) },
    }))
    .sort((a, b) => a.text.localeCompare(b.text) || (a.gold.intent ?? "").localeCompare(b.gold.intent ?? ""));
}
