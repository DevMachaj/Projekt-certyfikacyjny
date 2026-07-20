import type { ClassificationState } from "@/types";

/**
 * Per-state Tailwind badge classes. Presentation-only — kept out of the pure engine module
 * (`classification.ts`) on purpose, but shared between the React detail panel and the Astro
 * dashboard so the badge colors stay identical across both views.
 *
 * Values reference the S-08 design-system status tokens (see `src/styles/global.css`);
 * the `ui/Badge` component reads the same maps so the mapping stays single-sourced.
 * Class strings are kept literal so Tailwind's scanner can generate the utilities.
 */
export const STATE_STYLES: Record<ClassificationState, string> = {
  Understocked: "bg-status-under-bg text-status-under-fg border-status-under-border",
  Watch: "bg-status-watch-bg text-status-watch-fg border-status-watch-border",
  OK: "bg-status-ok-bg text-status-ok-fg border-status-ok-border",
  "Slow-mover": "bg-status-slow-bg text-status-slow-fg border-status-slow-border",
  "Insufficient data": "bg-status-insuff-bg text-status-insuff-fg border-status-insuff-border",
};

/** Solid dot color per state — used by the `ui/Badge` status pill. */
export const STATE_DOT: Record<ClassificationState, string> = {
  Understocked: "bg-status-under-solid",
  Watch: "bg-status-watch-solid",
  OK: "bg-status-ok-solid",
  "Slow-mover": "bg-status-slow-solid",
  "Insufficient data": "bg-status-insuff-solid",
};
