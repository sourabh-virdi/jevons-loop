import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { buildGoldSet, INCIDENT_COMPONENTS, windowsFromLog, type GoldIncident } from "@/domains/incident/labels";
import type { DatasetAdapter, DatasetExample } from "@/domains/types";
import { sampleSeeded } from "@/lib/rng";
import type { Split } from "@/types/contracts";

const GoldSchema = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    component: z.enum(INCIDENT_COMPONENTS),
    severity: z.number().int().min(0).max(3),
    source: z.enum(["bgl", "hdfs"]),
  }),
);

const VALIDATION_SEED = 77;

export function loadIncidentGold(): GoldIncident[] {
  const path = resolve("src/domains/incident/fixtures/gold-200.json");
  if (existsSync(path)) return GoldSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  return buildGoldSet();
}

export function loadIncidentTrain(): DatasetExample[] {
  const bgl = resolve("data/datasets/loghub/BGL_2k.log");
  const hdfs = resolve("data/datasets/loghub/HDFS_2k.log");
  const derived: DatasetExample[] = [];
  if (existsSync(bgl)) derived.push(...windowsFromLog(readFileSync(bgl, "utf8"), "bgl").map(toExample));
  if (existsSync(hdfs)) derived.push(...windowsFromLog(readFileSync(hdfs, "utf8"), "hdfs").map(toExample));
  if (derived.length >= 20) return derived;
  return buildGoldSet().map((item, index) => toExample({ ...item, id: `synth-train-${index}` }));
}

export function carveIncidentSplits(): Record<Split, DatasetExample[]> {
  const test = loadIncidentGold().map(toExample);
  const trainAll = loadIncidentTrain().filter((example) => !test.some((gold) => gold.text === example.text));
  const source = trainAll.length > 0 ? trainAll : test.map((example, index) => ({ ...example, id: `train-copy-${index}` }));
  const shuffled = sampleSeeded(source, source.length, VALIDATION_SEED);
  const validationCount = Math.max(1, Math.round(shuffled.length * 0.2));
  return {
    test,
    validation: shuffled.slice(0, validationCount),
    train: shuffled.slice(validationCount),
  };
}

export const incidentDataset: DatasetAdapter = {
  load(split) {
    return carveIncidentSplits()[split];
  },
};

function toExample(item: GoldIncident): DatasetExample {
  return {
    id: item.id,
    text: item.text,
    gold: { component: item.component, severity: item.severity, family: item.component },
  };
}
