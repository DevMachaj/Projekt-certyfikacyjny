import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Product } from "@/types";

interface Props {
  /** The product pending deletion, or `null` when the dialog is closed. */
  product: Product | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation modal for deleting a product. Explicitly warns that all associated sales
 * entries are permanently removed (FR-011 — enforced by DB ON DELETE CASCADE).
 */
export function DeleteProductDialog({ product, pending, onConfirm, onCancel }: Props) {
  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="border-white/10 bg-slate-900 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-red-400" />
            Delete {product?.name}?
          </DialogTitle>
          <DialogDescription className="text-blue-100/70">
            This permanently removes the product and all of its sales entries. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={pending}
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Deleting..." : "Delete product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
