import React, { useState } from "react";
import { CalendarDays, Hash } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { salesEntrySchema, type SalesEntryInput } from "@/lib/validation/sales-entry";

interface Props {
  onSubmit: (input: SalesEntryInput) => Promise<void>;
  pending: boolean;
  serverError?: string | null;
}

type FieldErrors = Partial<Record<keyof SalesEntryInput, string>>;

/**
 * Add-entry form. Validates against the same `salesEntrySchema` the API uses, so client and
 * server agree (units >= 0, real ISO dates, end >= start, no future end_date). Field errors map
 * per input; server errors (e.g. the 409 overlap message) surface via `ServerError`.
 */
export function SalesEntryForm({ onSubmit, pending, serverError }: Props) {
  const [units, setUnits] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  function clearError(field: keyof SalesEntryInput) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const candidate = {
      // Number("") is 0, which would silently pass a required numeric field — treat blank as NaN.
      units_sold: units.trim() === "" ? NaN : Number(units),
      start_date: startDate,
      end_date: endDate,
    };

    const result = salesEntrySchema.safeParse(candidate);
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof SalesEntryInput | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    await onSubmit(result.data);
    // Clear the form on success so the next entry starts blank.
    setUnits("");
    setStartDate("");
    setEndDate("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        id="units_sold"
        type="number"
        label="Units sold"
        value={units}
        onChange={(v) => {
          setUnits(v);
          clearError("units_sold");
        }}
        placeholder="e.g. 12"
        error={errors.units_sold}
        icon={<Hash className="size-4" />}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          id="start_date"
          type="date"
          label="Start date"
          value={startDate}
          onChange={(v) => {
            setStartDate(v);
            clearError("start_date");
          }}
          error={errors.start_date}
          icon={<CalendarDays className="size-4" />}
        />
        <FormField
          id="end_date"
          type="date"
          label="End date"
          value={endDate}
          onChange={(v) => {
            setEndDate(v);
            clearError("end_date");
          }}
          error={errors.end_date}
          icon={<CalendarDays className="size-4" />}
        />
      </div>

      <ServerError message={serverError} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving..." : "Log sales entry"}
      </Button>
    </form>
  );
}
