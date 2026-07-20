import { CheckCircle2, CircleHelp, ShoppingCart, TrendingDown } from "lucide-react";
import {
  recommendationText,
  STATE_ORDER,
  THRESHOLD_DEFINITIONS,
  type ClassificationResult,
  type Recommendation,
} from "@/lib/classification";
import { STATE_STYLES } from "@/lib/classification-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
    <Card className="gap-0 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-card-foreground text-lg font-semibold">{product.name}</h2>
        <Badge state={state} />
      </div>

      <p className="text-muted-foreground mt-2 text-sm">{THRESHOLD_DEFINITIONS[state]}</p>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-subtle)] px-4 py-3 text-[var(--accent-subtle-fg)]">
        {rec.icon}
        <span className="font-medium">{rec.text}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Velocity</dt>
          <dd className="text-card-foreground">{fmt(velocity)}/day</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Days of stock</dt>
          <dd className="text-card-foreground">{fmt(daysOfStock, 1)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">History</dt>
          <dd className="text-card-foreground">
            {totalDays} {totalDays === 1 ? "day" : "days"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Units sold</dt>
          <dd className="text-card-foreground">{totalUnits}</dd>
        </div>
      </dl>

      <details className="border-border bg-muted/40 mt-4 rounded-lg border p-3">
        <summary className="text-muted-foreground cursor-pointer text-sm">What do the states mean?</summary>
        <ul className="mt-3 space-y-2">
          {STATE_ORDER.map((s) => (
            <li
              key={s}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                s === state ? cn("border", STATE_STYLES[s]) : "text-muted-foreground",
              )}
            >
              <span className="font-medium">{s}</span> — {THRESHOLD_DEFINITIONS[s]}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}
