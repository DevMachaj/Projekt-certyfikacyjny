import { useState } from "react";
import { Plus, Pencil, Trash2, Package, CircleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductForm } from "@/components/products/ProductForm";
import { DeleteProductDialog } from "@/components/products/DeleteProductDialog";
import { BulkDeleteDialog } from "@/components/products/BulkDeleteDialog";
import type { ProductInput } from "@/lib/validation/product";
import type { Product } from "@/types";

interface Props {
  initialProducts: Product[];
}

type FormTarget = { mode: "add" } | { mode: "edit"; product: Product } | null;

function sortByName(products: Product[]): Product[] {
  return [...products].sort((a, b) => a.name.localeCompare(b.name));
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
 * Catalog island: owns product state and all CRUD fetches. Mutations call the JSON API and
 * update local state in place (no full reload). Add/edit share one modal form; delete uses a
 * confirmation modal. List-level failures surface as a dismissible inline banner.
 */
export function ProductCatalog({ initialProducts }: Props) {
  const [products, setProducts] = useState<Product[]>(() => sortByName(initialProducts));
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // Bulk-delete flow state — kept separate from `pending` so it never cross-disables
  // the add/edit modal or the single-delete dialog.
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  // Selection state is derived against the current product list so a dangling id
  // (e.g. a product removed by another flow) never inflates the counts.
  const selectedCount = products.reduce((n, p) => (selectedIds.has(p.id) ? n + 1 : n), 0);
  const allSelected = products.length > 0 && selectedCount === products.length;
  const someSelected = selectedCount > 0 && !allSelected;

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(products.map((p) => p.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function openAdd() {
    setFormError(null);
    setFormTarget({ mode: "add" });
  }

  function openEdit(product: Product) {
    setFormError(null);
    setFormTarget({ mode: "edit", product });
  }

  function closeForm() {
    setFormTarget(null);
    setFormError(null);
  }

  async function handleSubmit(input: ProductInput) {
    if (!formTarget) return;
    setPending(true);
    setFormError(null);

    try {
      const isEdit = formTarget.mode === "edit";
      const url = isEdit ? `/api/products/${formTarget.product.id}` : "/api/products";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        setFormError(await readError(res, "Could not save the product. Please try again."));
        return;
      }

      const { product } = (await res.json()) as { product: Product };
      setProducts((prev) =>
        sortByName(isEdit ? prev.map((p) => (p.id === product.id ? product : p)) : [...prev, product]),
      );
      closeForm();
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
      const res = await fetch(`/api/products/${target.id}`, { method: "DELETE" });
      if (!res.ok) {
        setListError(await readError(res, `Could not delete "${target.name}". Please try again.`));
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== target.id));
      setSelectedIds((prev) => {
        if (!prev.has(target.id)) return prev;
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      setDeleteTarget(null);
    } catch {
      setListError("Network error — please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleBulkDelete() {
    // Snapshot {id, name} before the loop: `products` is mutated as deletes succeed, so the
    // failure banner must resolve names from this snapshot, not the shrinking list.
    const targets = products.filter((p) => selectedIds.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
    if (targets.length === 0) return;

    setBulkConfirmOpen(false);
    setBulkDeleting(true);
    setBulkProgress({ done: 0, total: targets.length });
    setListError(null);

    const failed: string[] = [];

    try {
      for (const target of targets) {
        let ok = false;
        try {
          const res = await fetch(`/api/products/${target.id}`, { method: "DELETE" });
          ok = res.ok; // 204 No Content on success — never parse the body here.
        } catch {
          ok = false;
        }

        if (ok) {
          setProducts((prev) => prev.filter((p) => p.id !== target.id));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(target.id);
            return next;
          });
        } else {
          failed.push(target.name);
        }

        setBulkProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      }

      if (failed.length > 0) {
        const names = failed.map((n) => `"${n}"`).join(", ");
        setListError(
          `Could not delete ${failed.length} of ${targets.length} ${
            targets.length === 1 ? "product" : "products"
          }: ${names}. They remain selected — try again.`,
        );
      }
    } finally {
      setBulkDeleting(false);
      setBulkProgress({ done: 0, total: 0 });
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-foreground text-3xl font-bold tracking-tight">Products</h1>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="size-4" />
          Add product
        </Button>
      </div>

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

      {products.length === 0 ? (
        <div className="border-border bg-card text-card-foreground rounded-lg border p-12 text-center shadow-[var(--ds-shadow-sm)]">
          <Package className="text-muted-foreground mx-auto mb-4 size-10" />
          <p className="text-foreground mb-1 text-lg font-medium">No products yet</p>
          <p className="text-muted-foreground mb-6 text-sm">Add your first product to start tracking it.</p>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="size-4" />
            Add your first product
          </Button>
        </div>
      ) : (
        <>
          <div className="border-border bg-card mb-3 flex items-center justify-between gap-3 rounded-lg border px-4 py-2">
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                disabled={bulkDeleting}
                aria-label="Select all products"
              />
              Select all
            </label>
            {selectedCount > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm" aria-live="polite">
                  {bulkDeleting
                    ? `Deleting ${bulkProgress.done} of ${bulkProgress.total}…`
                    : `${selectedCount} selected`}
                </span>
                <Button variant="ghost" size="sm" onClick={clearSelection} disabled={bulkDeleting}>
                  Clear selection
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={bulkDeleting}
                  onClick={() => {
                    setBulkConfirmOpen(true);
                  }}
                  className="gap-1.5"
                >
                  <Trash2 className="size-4" />
                  Delete selected
                </Button>
              </div>
            ) : null}
          </div>
          <ul className="space-y-3">
            {products.map((product) => (
              <li
                key={product.id}
                className="border-border bg-card flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Checkbox
                    checked={selectedIds.has(product.id)}
                    onCheckedChange={() => {
                      toggleOne(product.id);
                    }}
                    disabled={bulkDeleting}
                    aria-label={`Select ${product.name}`}
                  />
                  <div className="min-w-0">
                    <a
                      href={`/products/${product.id}`}
                      className="text-foreground hover:text-primary block truncate font-medium hover:underline"
                    >
                      {product.name}
                    </a>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      Stock: {product.stock_quantity} · Lead time:{" "}
                      {product.lead_time_days != null ? `${product.lead_time_days}d` : "not set"} · Buffer:{" "}
                      {product.buffer_days}d
                    </p>
                  </div>
                </div>
                <div className="ml-4 flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      openEdit(product);
                    }}
                    aria-label={`Edit ${product.name}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setDeleteTarget(product);
                    }}
                    disabled={bulkDeleting}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${product.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog
        open={formTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formTarget?.mode === "edit" ? "Edit product" : "Add product"}</DialogTitle>
          </DialogHeader>
          {formTarget ? (
            <ProductForm
              key={formTarget.mode === "edit" ? formTarget.product.id : "add"}
              initial={formTarget.mode === "edit" ? formTarget.product : undefined}
              onSubmit={handleSubmit}
              pending={pending}
              serverError={formError}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <DeleteProductDialog
        product={deleteTarget}
        pending={pending}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />

      <BulkDeleteDialog
        open={bulkConfirmOpen}
        count={selectedCount}
        pending={bulkDeleting}
        onConfirm={() => void handleBulkDelete()}
        onCancel={() => {
          setBulkConfirmOpen(false);
        }}
      />
    </div>
  );
}
