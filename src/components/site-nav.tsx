import Link from "next/link";

const links = [
  ["Playground", "/playground"],
  ["Benchmarks", "/benchmarks"],
  ["Calibration", "/calibration"],
  ["Thresholds", "/thresholds"],
  ["Decisions", "/decisions"],
];

export function SiteNav() {
  return (
    <header className="border-b border-stone-300 bg-stone-950 text-stone-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Hybrid Decision Layer
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm text-stone-300">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="hover:text-white">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
