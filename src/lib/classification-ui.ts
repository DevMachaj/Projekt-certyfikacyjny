import type { ClassificationState } from "@/types";

/**
 * Per-state Tailwind badge classes. Presentation-only — kept out of the pure engine module
 * (`classification.ts`) on purpose, but shared between the React detail panel and the Astro
 * dashboard so the badge colors stay identical across both views.
 */
export const STATE_STYLES: Record<ClassificationState, string> = {
  Understocked: "bg-red-500/20 text-red-200 border-red-400/40",
  Watch: "bg-amber-500/20 text-amber-200 border-amber-400/40",
  OK: "bg-emerald-500/20 text-emerald-200 border-emerald-400/40",
  "Slow-mover": "bg-purple-500/20 text-purple-200 border-purple-400/40",
  "Insufficient data": "bg-white/10 text-blue-100/70 border-white/20",
};
