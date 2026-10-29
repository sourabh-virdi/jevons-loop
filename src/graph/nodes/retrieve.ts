import { getEnv } from "@/config/env";
import type { DomainPack } from "@/domains/types";
import { emitStep } from "@/graph/runtime";
import type { GraphState } from "@/graph/state";
import { localEmbed } from "@/retrieval/local-embed";
import { getVectorStore } from "@/retrieval/index-store";
import { chunkDocument, readCorpus } from "@/retrieval/ingest";
import { MemoryVectorStore } from "@/retrieval/index-store";

const memoryIndexes = new Map<string, MemoryVectorStore>();

export function makeRetrieve(pack: DomainPack) {
  return async (state: GraphState, config: { configurable?: Record<string, unknown> }) => {
    const started = Date.now();
    const env = getEnv();
    const embedder = env.JEV_TRANSPORT === "mock" || !env.OPENROUTER_API_KEY ? "local-hash-v1" : env.EMBEDDING_MODEL;
    const query = state.effectiveQuery || state.query;
    const embedding = localEmbed(query);
    let hits = await getVectorStore(pack.id, embedder).search(embedding, 4);
    if (hits.length === 0) {
      const memory = memoryIndex(pack);
      hits = await memory.search(embedding, 4);
    }
    const chunks = hits.map((hit) => ({
      id: hit.id,
      text: hit.text,
      source: hit.source,
      family: hit.family,
      score: hit.score,
    }));
    const step = emitStep(state, config, "retrieve", started, chunks.map((chunk) => chunk.source).join(", ") || "no chunks");
    return { chunks, steps: [step], embeddingCalls: state.embeddingCalls + 1 };
  };
}

function memoryIndex(pack: DomainPack): MemoryVectorStore {
  const existing = memoryIndexes.get(pack.id);
  if (existing) return existing;
  const docs = readCorpus(pack.corpus.dir);
  const chunks = docs.flatMap((doc) =>
    chunkDocument(doc, pack.corpus.chunkSize, pack.corpus.chunkOverlap).map((text, index) => ({
      id: `${doc.id}-${index}`,
      text,
      source: doc.source,
      family: doc.family,
      embedding: localEmbed(text),
    })),
  );
  const store = new MemoryVectorStore(chunks);
  memoryIndexes.set(pack.id, store);
  return store;
}
