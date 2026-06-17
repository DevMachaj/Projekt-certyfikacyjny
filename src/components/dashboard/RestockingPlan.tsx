import { useState } from "react";
import { Sparkles, CircleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Sparkles className="h-5 w-5 text-purple-300" aria-hidden="true" />
            Weekly restocking plan
          </h2>
          <p className="mt-1 text-sm text-blue-100/60">
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
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/20 px-3 py-2 text-sm text-red-200">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {plan && (
        <div className="mt-4">
          {plan.source === "empty" ? (
            <p className="text-sm text-blue-100/80">Nothing to reorder this week.</p>
          ) : (
            <>
              {plan.source === "fallback" && (
                <p className="mb-3 flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/20 px-3 py-2 text-xs text-amber-200">
                  <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  AI summary unavailable — showing a basic plan.
                </p>
              )}
              <p className="text-sm font-medium text-blue-100/90">{plan.headline}</p>
              <ol className="mt-3 space-y-2">
                {plan.items.map((item) => (
                  <li key={item.product} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-white">{item.product}</span>
                      <span className="text-blue-100/70">{item.action}</span>
                    </div>
                    <p className="mt-1 text-blue-100/80">{item.reason}</p>
                    {item.daysOfStock != null && item.leadTime != null && (
                      <p className="mt-1 text-xs text-blue-100/50">
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
    </section>
  );
}
