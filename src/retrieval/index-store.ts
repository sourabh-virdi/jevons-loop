import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { cosine } from "@/retrieval/local-embed";

export interface IndexedChunk {
  id: string;
  text: string;
  source: string;
  family: string;
  embedding: number[];
}

export interface SearchHit {
  id: string;
  text: string;
  source: string;
  family: string;
  score: number;
}

export interface VectorStore {
  upsert(chunks: IndexedChunk[]): Promise<void>;
  search(queryEmbedding: number[], k: number, filter?: { family?: string }): Promise<SearchHit[]>;
}

const IndexFileSchema = z.object({
  embedder: z.string(),
  chunks: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      source: z.string(),
      family: z.string(),
      embedding: z.array(z.number()),
    }),
  ),
});

export class FileVectorStore implements VectorStore {
  private chunks: IndexedChunk[] = [];

  constructor(
    private readonly filePath: string,
    readonly embedder: string,
  ) {}

  load(): void {
    if (!existsSync(this.filePath)) {
      this.chunks = [];
      return;
    }
    const parsed = IndexFileSchema.parse(JSON.parse(readFileSync(this.filePath, "utf8")));
    this.chunks = parsed.embedder === this.embedder ? parsed.chunks : [];
  }

  async upsert(chunks: IndexedChunk[]): Promise<void> {
    this.chunks = chunks;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(
      this.filePath,
      JSON.stringify({ embedder: this.embedder, chunks }),
    );
  }

  async search(queryEmbedding: number[], k: number, filter?: { family?: string }): Promise<SearchHit[]> {
    if (this.chunks.length === 0) this.load();
    return this.chunks
      .filter((chunk) => (filter?.family ? chunk.family === filter.family : true))
      .map((chunk) => ({
        id: chunk.id,
        text: chunk.text,
        source: chunk.source,
        family: chunk.family,
        score: cosine(queryEmbedding, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

export class MemoryVectorStore implements VectorStore {
  constructor(private chunks: IndexedChunk[] = []) {}

  async upsert(chunks: IndexedChunk[]): Promise<void> {
    this.chunks = chunks;
  }

  async search(queryEmbedding: number[], k: number, filter?: { family?: string }): Promise<SearchHit[]> {
    return this.chunks
      .filter((chunk) => (filter?.family ? chunk.family === filter.family : true))
      .map((chunk) => ({
        id: chunk.id,
        text: chunk.text,
        source: chunk.source,
        family: chunk.family,
        score: cosine(queryEmbedding, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

const stores = new Map<string, FileVectorStore>();

export function indexPath(domainId: string): string {
  return resolve("data/indexes", `${domainId}.json`);
}

export function getVectorStore(domainId: string, embedder: string): FileVectorStore {
  const key = `${domainId}:${embedder}`;
  const existing = stores.get(key);
  if (existing) return existing;
  const store = new FileVectorStore(indexPath(domainId), embedder);
  store.load();
  stores.set(key, store);
  return store;
}
