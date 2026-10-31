import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDotEnv } from "../src/config/load-dotenv";

loadDotEnv();

const sources = [
  {
    name: "banking77 train",
    urls: [
      "https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/master/banking_data/train.csv",
    ],
    out: resolve("data/datasets/banking77/train.csv"),
  },
  {
    name: "banking77 test",
    urls: [
      "https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/master/banking_data/test.csv",
    ],
    out: resolve("data/datasets/banking77/test.csv"),
  },
  {
    name: "BGL 2k",
    urls: ["https://raw.githubusercontent.com/logpai/loghub/master/BGL/BGL_2k.log"],
    out: resolve("data/datasets/loghub/BGL_2k.log"),
  },
  {
    name: "HDFS 2k",
    urls: ["https://raw.githubusercontent.com/logpai/loghub/master/HDFS/HDFS_2k.log"],
    out: resolve("data/datasets/loghub/HDFS_2k.log"),
  },
];

for (const source of sources) {
  mkdirSync(resolve(source.out, ".."), { recursive: true });
  let text = "";
  let lastError = "no response";
  for (const url of source.urls) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "jevons-loop-fetch/1.0" } });
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      text = await response.text();
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "fetch failed";
    }
  }
  if (!text) throw new Error(`Could not download ${source.name}: ${lastError}`);
  writeFileSync(source.out, text);
  console.log(JSON.stringify({ downloaded: source.name, bytes: text.length, path: source.out }));
}

const { readFileSync } = await import("node:fs");
for (const split of ["train", "test"] as const) {
  const csv = readFileSync(resolve(`data/datasets/banking77/${split}.csv`), "utf8");
  const rows = parseBankingCsv(csv);
  writeFileSync(resolve(`data/datasets/banking77/${split}.json`), JSON.stringify(rows));
  console.log(JSON.stringify({ split, rows: rows.length }));
}

function parseBankingCsv(csv: string): Array<{ text: string; label: string }> {
  const table = parseCsv(csv);
  if (table.length === 0) return [];
  const header = table[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const start = header.includes("text") || header.includes("label") || header.includes("category") ? 1 : 0;
  const textIndex = Math.max(0, header.indexOf("text"));
  const labelIndex = header.includes("category") ? header.indexOf("category") : header.includes("label") ? header.indexOf("label") : 1;
  return table.slice(start).flatMap((row) => {
    const text = row[textIndex]?.trim();
    const label = row[labelIndex === textIndex ? (textIndex === 0 ? 1 : 0) : labelIndex]?.trim();
    if (!text || !label) return [];
    return [{ text, label }];
  });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === "," || char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim().length > 0));
}
