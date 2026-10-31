import { CalibrationView } from "@/components/calibration-view";

export const dynamic = "force-dynamic";

export default function CalibrationPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Calibration</h1>
      <p className="text-sm text-stone-600">Reliability diagrams use 10 equal-width bins. ECE and Brier are computed from stated confidence and whether the checkpoint was correct.</p>
      <CalibrationView />
    </div>
  );
}
