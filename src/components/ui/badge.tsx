import * as React from "react";

import type { ClassificationState } from "@/types";
import { STATE_STYLES, STATE_DOT } from "@/lib/classification-ui";
import { cn } from "@/lib/utils";

// Status pill for the five velocity-classification states (muted hue + solid dot),
// plus neutral/accent tones for generic tags. `state` maps 1:1 to the engine and
// drives the whole look via the single-sourced STATE_STYLES/STATE_DOT maps.
const TONE_STYLES = {
  neutral: "bg-muted text-muted-foreground border-border",
  accent: "bg-[var(--accent-subtle)] text-[var(--accent-subtle-fg)] border-[var(--accent-border)]",
} as const;

const TONE_DOT = {
  neutral: "bg-muted-foreground",
  accent: "bg-primary",
} as const;

function Badge({
  state,
  tone = "neutral",
  dot = true,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  state?: ClassificationState;
  tone?: "neutral" | "accent";
  dot?: boolean;
}) {
  const styles = state ? STATE_STYLES[state] : TONE_STYLES[tone];
  const dotColor = state ? STATE_DOT[state] : TONE_DOT[tone];
  const label = children ?? state;

  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        styles,
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", dotColor)} />}
      {label}
    </span>
  );
}

export { Badge };
