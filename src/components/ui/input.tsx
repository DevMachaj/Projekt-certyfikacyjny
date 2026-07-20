import * as React from "react";

import { cn } from "@/lib/utils";

// Text / numeric input primitive. `variant="numeric"` switches to the mono face
// with tabular figures so stock/lead-time/units columns align. `suffix` renders
// a trailing unit inside the field; `invalid` flips to the destructive border.
// `type` stays caller-controlled so consumers keep `type="number"` (spinbutton
// role) — S-09 backs auth/FormField's input with this primitive.
function Input({
  className,
  type,
  variant = "text",
  suffix,
  invalid,
  ...props
}: React.ComponentProps<"input"> & {
  variant?: "text" | "numeric";
  suffix?: React.ReactNode;
  invalid?: boolean;
}) {
  const field = (
    <input
      type={type}
      data-slot="input"
      aria-invalid={invalid ? true : undefined}
      className={cn(
        "border-input placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-[var(--ds-shadow-xs)] transition-[color,box-shadow] outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        "disabled:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
        variant === "numeric" && "font-mono [font-feature-settings:var(--num-features)]",
        suffix ? "pr-12" : undefined,
        className,
      )}
      {...props}
    />
  );

  if (!suffix) return field;

  return (
    <div className="relative w-full">
      {field}
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
        {suffix}
      </span>
    </div>
  );
}

export { Input };
