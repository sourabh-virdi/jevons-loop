import { DecisionsView } from "@/components/decisions-view";

export const dynamic = "force-dynamic";

export default function DecisionsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Decision log</h1>
      <p className="text-sm text-stone-600">Filter by domain, checkpoint, escalation, or disagreement. Disagreements show the state preview used to refine questions.</p>
      <DecisionsView />
    </div>
  );
}
