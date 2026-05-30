import { useState } from "react";
import { Plus, Pencil, Trash2, Package, CircleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductForm } from "@/components/products/ProductForm";
import { DeleteProductDialog } from "@/components/products/DeleteProductDialog";
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
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

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
      setDeleteTarget(null);
    } catch {
      setListError("Network error — please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-3xl font-bold text-transparent">
          Products
        </h1>
        <Button onClick={openAdd} className="gap-2 rounded-lg bg-purple-600 font-medium text-white hover:bg-purple-500">
          <Plus className="size-4" />
          Add product
        </Button>
      </div>

      {listError ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{listError}</span>
          <button
            type="button"
            onClick={() => {
              setListError(null);
            }}
            className="text-red-300/70 hover:text-red-200"
            aria-label="Dismiss error"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {products.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
          <Package className="mx-auto mb-4 size-10 text-blue-100/40" />
          <p className="mb-1 text-lg font-medium text-white">No products yet</p>
          <p className="mb-6 text-sm text-blue-100/60">Add your first product to start tracking it.</p>
          <Button
            onClick={openAdd}
            className="gap-2 rounded-lg bg-purple-600 font-medium text-white hover:bg-purple-500"
          >
            <Plus className="size-4" />
            Add your first product
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {products.map((product) => (
            <li
              key={product.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{product.name}</p>
                <p className="mt-0.5 text-sm text-blue-100/60">
                  Stock: {product.stock_quantity} · Lead time:{" "}
                  {product.lead_time_days != null ? `${product.lead_time_days}d` : "not set"} · Buffer:{" "}
                  {product.buffer_days}d
                </p>
              </div>
              <div className="ml-4 flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    openEdit(product);
                  }}
                  className="text-blue-100/70 hover:bg-white/10 hover:text-white"
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
                  className="text-red-300/70 hover:bg-red-500/10 hover:text-red-300"
                  aria-label={`Delete ${product.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={formTarget !== null}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="border-white/10 bg-slate-900 text-white">
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
    </div>
  );
}
