import { PlaygroundView } from "@/components/playground-view";
import { getEnv } from "@/config/env";
import { listDomains } from "@/domains/registry";

export const dynamic = "force-dynamic";

export default async function PlaygroundPage({ searchParams }: { searchParams: Promise<{ domain?: string }> }) {
  const params = await searchParams;
  const domains = listDomains().map((domain) => ({
    id: domain.id,
    displayName: domain.displayName,
    description: domain.description,
    samplePrompts: domain.samplePrompts,
  }));
  const configured = getEnv().DEFAULT_DOMAIN;
  const requested = params.domain;
  const defaultDomain = domains.some((domain) => domain.id === requested) ? requested! : configured;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Playground</h1>
      <PlaygroundView domains={domains} defaultDomain={defaultDomain} />
    </div>
  );
}
