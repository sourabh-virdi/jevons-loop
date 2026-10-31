import { ThresholdsView } from "@/components/thresholds-view";

export const dynamic = "force-dynamic";

export default function ThresholdsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Thresholds</h1>
      <p className="text-sm text-stone-600">Sliders snap to the stored sweep. The teal points are the Pareto frontier. The rust point is the saved choice.</p>
      <ThresholdsView />
    </div>
  );
}
