import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getEnv } from "@/config/env";
import { createLlmClient } from "@/engines/llm/client";
import { localEmbed } from "@/retrieval/local-embed";
import { getVectorStore, type IndexedChunk } from "@/retrieval/index-store";

export interface CorpusDocument {
  id: string;
  family: string;
  intents: string[];
  title: string;
  body: string;
  source: string;
}

export function readCorpus(dir: string): CorpusDocument[] {
  const full = resolve(dir);
  const files = readdirSync(full).filter((name) => name.endsWith(".md")).sort();
  return files.map((name) => parseMarkdown(join(full, name), name));
}

export function parseMarkdown(path: string, source: string): CorpusDocument {
  const raw = readFileSync(path, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  const meta = match?.[1] ?? "";
  const body = (match?.[2] ?? raw).trim();
  const id = metaValue(meta, "id") || source.replace(/\.md$/, "");
  const family = metaValue(meta, "family") || "general";
  const intents = (metaValue(meta, "intents") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const title = body.split("\n").find((line) => line.startsWith("# "))?.replace(/^#\s+/, "") ?? id;
  return { id, family, intents, title, body, source };
}

export function chunkDocument(doc: CorpusDocument, size: number, overlap: number): string[] {
  const text = `${doc.title}\n${doc.intents.join(" ")}\n${doc.body}`;
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let index = 0;
  const step = Math.max(1, size - overlap);
  while (index < text.length) {
    chunks.push(text.slice(index, index + size));
    if (index + size >= text.length) break;
    index += step;
  }
  return chunks;
}

export async function ingestDomain(input: {
  domainId: string;
  dir: string;
  chunkSize: number;
  chunkOverlap: number;
}): Promise<{ chunks: number; embedder: string }> {
  const env = getEnv();
  const useRemote = env.JEV_TRANSPORT !== "mock" && env.OPENROUTER_API_KEY.trim().length > 0;
  const embedder = useRemote ? env.EMBEDDING_MODEL : "local-hash-v1";
  const docs = readCorpus(input.dir);
  const pieces: Array<Omit<IndexedChunk, "embedding">> = [];
  for (const doc of docs) {
    const parts = chunkDocument(doc, input.chunkSize, input.chunkOverlap);
    parts.forEach((text, index) => {
      pieces.push({
        id: `${doc.id}-${index}`,
        text,
        source: doc.source,
        family: doc.family,
      });
    });
  }
  let embeddings: number[][];
  let costUsd = 0;
  if (useRemote) {
    const client = createLlmClient();
    const embedded = await client.embed({ model: env.EMBEDDING_MODEL, texts: pieces.map((piece) => piece.text) });
    embeddings = embedded.embeddings;
    costUsd = embedded.costUsd;
  } else {
    embeddings = pieces.map((piece) => localEmbed(piece.text));
  }
  const chunks = pieces.map((piece, index) => ({
    ...piece,
    embedding: embeddings[index] ?? localEmbed(piece.text),
  }));
  const store = getVectorStore(input.domainId, embedder);
  await store.upsert(chunks);
  if (costUsd > 0) {
    const { log } = await import("@/lib/logger");
    log("info", "ingest embeddings", { domainId: input.domainId, costUsd, chunks: chunks.length });
  }
  return { chunks: chunks.length, embedder };
}

function metaValue(meta: string, key: string): string {
  const line = meta.split(/\r?\n/).find((item) => item.startsWith(`${key}:`));
  return line ? line.slice(key.length + 1).trim() : "";
}
