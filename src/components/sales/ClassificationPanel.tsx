import { CheckCircle2, CircleHelp, ShoppingCart, TrendingDown } from "lucide-react";
import {
  recommendationText,
  STATE_ORDER,
  THRESHOLD_DEFINITIONS,
  type ClassificationResult,
  type Recommendation,
} from "@/lib/classification";
import { STATE_STYLES } from "@/lib/classification-ui";
import { cn } from "@/lib/utils";
import type { ClassificationState, Product } from "@/types";

interface Props {
  classification: ClassificationResult;
  product: Product;
}

/** Icon per recommendation kind; the wording is sourced from the shared `recommendationText()`. */
function recommendationIcon(rec: Recommendation, state: ClassificationState): React.ReactNode {
  switch (rec.kind) {
    case "order":
      return <ShoppingCart className="size-5" />;
    case "promote":
      return <TrendingDown className="size-5" />;
    case "set-lead-time":
      return <CircleHelp className="size-5" />;
    case "none":
      return state === "Insufficient data" ? <CircleHelp className="size-5" /> : <CheckCircle2 className="size-5" />;
  }
}

function recommendationLine(rec: Recommendation, state: ClassificationState): { icon: React.ReactNode; text: string } {
  return { icon: recommendationIcon(rec, state), text: recommendationText(rec, state) };
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
