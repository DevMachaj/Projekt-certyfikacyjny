import { useState } from "react";
import { CircleAlert, Trash2, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClassificationPanel } from "@/components/sales/ClassificationPanel";
import { SalesEntryForm } from "@/components/sales/SalesEntryForm";
import { entryDays, type ClassificationResult } from "@/lib/classification";
import type { SalesEntryInput } from "@/lib/validation/sales-entry";
import type { Product, SalesEntry } from "@/types";

interface Props {
  product: Product;
  initialEntries: SalesEntry[];
  initialClassification: ClassificationResult;
}

function sortByStart(entries: SalesEntry[]): SalesEntry[] {
  return [...entries].sort((a, b) => a.start_date.localeCompare(b.start_date));
}

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
 * Detail island: owns the entry list + classification state and all sales-entry fetches.
 * Each mutation calls the nested API and replaces classification from the response (single
 * round-trip → NFR-001), updating state in place with no full reload.
 */
export function ProductDetail({ product, initialEntries, initialClassification }: Props) {
  const [entries, setEntries] = useState<SalesEntry[]>(() => sortByStart(initialEntries));
  const [classification, setClassification] = useState<ClassificationResult>(initialClassification);
  const [deleteTarget, setDeleteTarget] = useState<SalesEntry | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const base = `/api/products/${product.id}/sales-entries`;

  async function handleAdd(input: SalesEntryInput) {
    setPending(true);
    setFormError(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        setFormError(await readError(res, "Could not save the entry. Please try again."));
        return;
      }
      const { entry, classification: next } = (await res.json()) as {
        entry: SalesEntry;
        classification: ClassificationResult;
      };
      setEntries((prev) => sortByStart([...prev, entry]));
      setClassification(next);
    } catch {
      setFormError("Network error — please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setPending(true);
    setListError(null);
    try {
      const res = await fetch(`${base}/${target.id}`, { method: "DELETE" });
      if (!res.ok) {
        setListError(await readError(res, "Could not delete the entry. Please try again."));
        return;
      }
      const { classification: next } = (await res.json()) as { classification: ClassificationResult };
      setEntries((prev) => prev.filter((e) => e.id !== target.id));
      setClassification(next);
      setDeleteTarget(null);
    } catch {
      setListError("Network error — please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <ClassificationPanel classification={classification} product={product} />

      <Card className="gap-0 p-6">
        <h3 className="text-card-foreground mb-4 text-base font-semibold">Log a sales entry</h3>
        <SalesEntryForm onSubmit={handleAdd} pending={pending} serverError={formError} />
      </Card>

      <Card className="gap-0 p-6">
        <h3 className="text-card-foreground mb-4 text-base font-semibold">Sales entries</h3>

        {listError ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1">{listError}</span>
            <button
              type="button"
              onClick={() => {
                setListError(null);
              }}
              className="text-destructive/70 hover:text-destructive"
              aria-label="Dismiss error"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        {entries.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No sales entries yet. Log your first entry above to start tracking this product.
          </p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="border-border bg-muted/40 flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-card-foreground font-medium">{entry.units_sold} units</p>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    {entry.start_date} → {entry.end_date} · {entryDays(entry)}d
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setDeleteTarget(entry);
                  }}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive ml-4 shrink-0"
                  aria-label={`Delete entry ${entry.start_date} to ${entry.end_date}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="text-destructive size-5" />
              Delete this sales entry?
            </DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `${deleteTarget.units_sold} units (${deleteTarget.start_date} → ${deleteTarget.end_date}) will be permanently removed and the classification will recalculate. This cannot be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={pending}>
              {pending ? "Deleting..." : "Delete entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
