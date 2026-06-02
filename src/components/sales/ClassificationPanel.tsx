import { CheckCircle2, CircleHelp, ShoppingCart, TrendingDown } from "lucide-react";
import { THRESHOLD_DEFINITIONS, type ClassificationResult, type Recommendation } from "@/lib/classification";
import { cn } from "@/lib/utils";
import type { ClassificationState, Product } from "@/types";

interface Props {
  classification: ClassificationResult;
  product: Product;
}

/** Fixed display order (matches the PRD dashboard order S-03 will reuse). */
const STATE_ORDER: ClassificationState[] = ["Understocked", "Watch", "OK", "Slow-mover", "Insufficient data"];

const STATE_STYLES: Record<ClassificationState, string> = {
  Understocked: "bg-red-500/20 text-red-200 border-red-400/40",
  Watch: "bg-amber-500/20 text-amber-200 border-amber-400/40",
  OK: "bg-emerald-500/20 text-emerald-200 border-emerald-400/40",
  "Slow-mover": "bg-purple-500/20 text-purple-200 border-purple-400/40",
  "Insufficient data": "bg-white/10 text-blue-100/70 border-white/20",
};

function recommendationLine(rec: Recommendation, state: ClassificationState): { icon: React.ReactNode; text: string } {
  switch (rec.kind) {
    case "order":
      return { icon: <ShoppingCart className="size-5" />, text: `Order ${rec.units} units` };
    case "promote":
      return { icon: <TrendingDown className="size-5" />, text: "Consider promotion" };
    case "set-lead-time":
      return { icon: <CircleHelp className="size-5" />, text: "Set lead time to get reorder suggestion" };
    case "none":
      return state === "Insufficient data"
        ? {
            icon: <CircleHelp className="size-5" />,
            text: "Log at least 7 days of non-overlapping sales to get a classification.",
          }
        : { icon: <CheckCircle2 className="size-5" />, text: "No action needed right now." };
  }
}

function fmt(value: number | null, digits = 2): string {
  return value == null ? "—" : value.toFixed(digits);
}

/**
 * Presents the product's classification: the assigned state badge + its threshold definition,
 * the recommended action, the underlying numbers (for transparency), and the full threshold
 * ladder for every state (assigned one highlighted) — satisfying FR-006's "threshold definition
 * for each state". Pure presentational; the engine result is computed server-side.
 */
export function ClassificationPanel({ classification, product }: Props) {
  const { state, velocity, daysOfStock, totalDays, totalUnits, recommendation } = classification;
  const rec = recommendationLine(recommendation, state);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{product.name}</h2>
        <span className={cn("rounded-full border px-3 py-1 text-sm font-medium", STATE_STYLES[state])}>{state}</span>
      </div>

      <p className="mt-2 text-sm text-blue-100/70">{THRESHOLD_DEFINITIONS[state]}</p>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-purple-400/30 bg-purple-500/10 px-4 py-3 text-purple-100">
        {rec.icon}
        <span className="font-medium">{rec.text}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-blue-100/50">Velocity</dt>
          <dd className="text-white">{fmt(velocity)}/day</dd>
        </div>
        <div>
          <dt className="text-blue-100/50">Days of stock</dt>
          <dd className="text-white">{fmt(daysOfStock, 1)}</dd>
        </div>
        <div>
          <dt className="text-blue-100/50">History</dt>
          <dd className="text-white">
            {totalDays} {totalDays === 1 ? "day" : "days"}
          </dd>
        </div>
        <div>
          <dt className="text-blue-100/50">Units sold</dt>
          <dd className="text-white">{totalUnits}</dd>
        </div>
      </dl>

      <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
        <summary className="cursor-pointer text-sm text-blue-100/70">What do the states mean?</summary>
        <ul className="mt-3 space-y-2">
          {STATE_ORDER.map((s) => (
            <li
              key={s}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                s === state ? cn("border", STATE_STYLES[s]) : "text-blue-100/60",
              )}
            >
              <span className="font-medium">{s}</span> — {THRESHOLD_DEFINITIONS[s]}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
