import { loadDotEnv } from "../src/config/load-dotenv";
import { listDomains } from "../src/domains/registry";
import { ingestDomain } from "../src/retrieval/ingest";

loadDotEnv();
const only = process.argv.find((arg) => arg.startsWith("--domain="))?.slice("--domain=".length);
for (const pack of listDomains()) {
  if (only && pack.id !== only) continue;
  const result = await ingestDomain({
    domainId: pack.id,
    dir: pack.corpus.dir,
    chunkSize: pack.corpus.chunkSize,
    chunkOverlap: pack.corpus.chunkOverlap,
  });
  console.log(JSON.stringify({ domain: pack.id, ...result }));
}
