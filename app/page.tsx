import Link from "next/link";
import { getEnv } from "@/config/env";
import { listDomains } from "@/domains/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const env = getEnv();
  const domains = listDomains();
  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-3">
        <p className="text-sm uppercase tracking-wide text-teal-800">System 1 + System 2</p>
        <h1 className="text-3xl font-semibold tracking-tight">One agent engine, two decision speeds.</h1>
        <p className="text-stone-700">
          Jev answers typed checkpoints. The LLM writes and takes over only when confidence is low.
          The same graph runs banking support and incident triage.
        </p>
        <p className="text-sm text-stone-600">Default domain from configuration: {env.DEFAULT_DOMAIN}. Transport: {env.JEV_TRANSPORT}.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {domains.map((domain) => (
          <Card key={domain.id}>
            <CardHeader>
              <CardTitle>{domain.displayName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-stone-700">
              <p>{domain.description}</p>
              <p>{domain.tools.length} mock tools · {domain.samplePrompts.length} sample prompts</p>
              <Link className="text-teal-800 underline" href={`/playground?domain=${domain.id}`}>
                Open playground
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link className="underline" href="/benchmarks">Compare runs</Link>
        <Link className="underline" href="/calibration">Calibration</Link>
        <Link className="underline" href="/thresholds">Threshold tuner</Link>
        <Link className="underline" href="/decisions">Decision log</Link>
      </div>
    </div>
  );
}
