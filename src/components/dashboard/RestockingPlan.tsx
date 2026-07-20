import { useState } from "react";
import { Sparkles, CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { RestockPlan } from "@/lib/restocking";

/** The route's response: the engine-built plan plus where the summary came from. */
type RestockPlanResponse = RestockPlan & { source: "ai" | "fallback" | "empty" };

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // non-JSON body — fall through to the generic message
  }
  return fallback;
}

/**
 * Dashboard island: a button that asks the route for the prioritized weekly restocking plan and
 * renders it. The engine builds the items, their order, actions, quantities, and facts on every
 * path; the AI authors only the `headline` and each item's `reason` on the `"ai"`
 * path (deterministic otherwise). Each row pairs the reason with the engine's own facts line so AI
 * prose sits next to verifiable numbers. A `"fallback"` source shows a small note (engine numbers
 * intact); `"empty"` shows the nothing-to-reorder message. Mirrors the existing island pattern
 * (local `readError`, `useState` for pending/error).
 */
export function RestockingPlan() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<RestockPlanResponse | null>(null);

  async function generate() {
    setPending(true);
    setError(null);
    setPlan(null); // drop any prior plan so the skeleton shows alone, never beside stale results
    try {
      const res = await fetch("/api/restocking-plan", { method: "POST" });
      if (!res.ok) {
        setError(await readError(res, "Could not generate the plan. Please try again."));
        return;
      }
      setPlan((await res.json()) as RestockPlanResponse);
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="mb-8 gap-0 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-card-foreground flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="text-primary h-5 w-5" aria-hidden="true" />
            Weekly restocking plan
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            A prioritized weekly plan — what to reorder first and why, built from your engine classifications.
          </p>
        </div>
        <Button onClick={() => void generate()} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Generating…
            </>
          ) : (
            "Generate weekly restocking plan"
          )}
        </Button>
      </div>

      {error && (
        <p className="border-destructive/30 bg-destructive/10 text-destructive mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {pending && (
        <div className="mt-4 space-y-2" aria-hidden="true">
          <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="border-border bg-muted/40 rounded-lg border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="bg-muted h-3 w-32 animate-pulse rounded" />
                <div className="bg-muted h-3 w-20 animate-pulse rounded" />
              </div>
              <div className="bg-muted/60 mt-2 h-3 w-3/4 animate-pulse rounded" />
            </div>
          ))}
        </div>
      )}

      {plan && (
        <div className="mt-4">
          {plan.source === "empty" ? (
            <p className="text-muted-foreground text-sm">Nothing to reorder this week.</p>
          ) : (
            <>
              {plan.source === "fallback" && (
                <p className="border-status-watch-border bg-status-watch-bg text-status-watch-fg mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                  <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  AI summary unavailable — showing a basic plan.
                </p>
              )}
              <p className="text-card-foreground text-sm font-medium">{plan.headline}</p>
              <ol className="mt-3 space-y-2">
                {plan.items.map((item) => (
                  <li key={item.product} className="border-border bg-muted/40 rounded-lg border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-card-foreground font-medium">{item.product}</span>
                      <span className="text-muted-foreground">{item.action}</span>
                    </div>
                    <p className="text-muted-foreground mt-1">{item.reason}</p>
                    {item.daysOfStock != null && item.leadTime != null && (
                      <p className="mt-1 text-xs text-[var(--text-subtle)]">
                        {Math.round(item.daysOfStock)}d stock · {item.leadTime}d lead time
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
