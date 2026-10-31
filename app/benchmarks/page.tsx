import { BenchmarksView } from "@/components/benchmarks-view";

export const dynamic = "force-dynamic";

export default function BenchmarksPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Benchmarks</h1>
      <p className="text-sm text-stone-600">Compare up to three runs. Export writes a Markdown table of cost, latency, accuracy, ECE, and answer quality.</p>
      <BenchmarksView />
    </div>
  );
}
