import React, { useState } from "react";
import { Package, Hash, Clock, Shield } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import { productSchema, type ProductInput } from "@/lib/validation/product";
import type { Product } from "@/types";

interface Props {
  /** When provided, the form is in edit mode and prefills from this product. */
  initial?: Product;
  onSubmit: (input: ProductInput) => Promise<void>;
  pending: boolean;
  serverError?: string | null;
}

type FieldErrors = Partial<Record<keyof ProductInput, string>>;

/**
 * Shared add/edit product form. Validates against the same `productSchema` the API uses,
 * so client and server agree. An empty lead-time field becomes `null` (FR-007 "not set"),
 * never `0`.
 */
export function ProductForm({ initial, onSubmit, pending, serverError }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [stock, setStock] = useState(initial ? String(initial.stock_quantity) : "");
  const [leadTime, setLeadTime] = useState(initial?.lead_time_days != null ? String(initial.lead_time_days) : "");
  const [buffer, setBuffer] = useState(initial ? String(initial.buffer_days) : "7");
  const [errors, setErrors] = useState<FieldErrors>({});

  function clearError(field: keyof ProductInput) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function toNumberOrNaN(value: string): number {
    // Number("") is 0, which would silently pass a required numeric field — treat blank as NaN.
    return value.trim() === "" ? NaN : Number(value);
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const candidate = {
      name,
      stock_quantity: toNumberOrNaN(stock),
      lead_time_days: leadTime.trim() === "" ? null : Number(leadTime),
      buffer_days: toNumberOrNaN(buffer),
    };

    const result = productSchema.safeParse(candidate);
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof ProductInput | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    await onSubmit(result.data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        id="name"
        label="Name"
        value={name}
        onChange={(v) => {
          setName(v);
          clearError("name");
        }}
        placeholder="e.g. Blue ceramic mug"
        error={errors.name}
        icon={<Package className="size-4" />}
      />
      <FormField
        id="stock_quantity"
        type="number"
        label="Stock quantity"
        value={stock}
        onChange={(v) => {
          setStock(v);
          clearError("stock_quantity");
        }}
        placeholder="0"
        error={errors.stock_quantity}
        icon={<Hash className="size-4" />}
      />
      <FormField
        id="lead_time_days"
        type="number"
        label="Lead time (days)"
        value={leadTime}
        onChange={(v) => {
          setLeadTime(v);
          clearError("lead_time_days");
        }}
        placeholder="Optional — leave blank if unknown"
        error={errors.lead_time_days}
        icon={<Clock className="size-4" />}
      />
      <FormField
        id="buffer_days"
        type="number"
        label="Buffer days"
        value={buffer}
        onChange={(v) => {
          setBuffer(v);
          clearError("buffer_days");
        }}
        placeholder="7"
        error={errors.buffer_days}
        icon={<Shield className="size-4" />}
      />

      <ServerError message={serverError} />

      <Button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
      >
        {pending ? "Saving..." : initial ? "Save changes" : "Add product"}
      </Button>
    </form>
  );
}
