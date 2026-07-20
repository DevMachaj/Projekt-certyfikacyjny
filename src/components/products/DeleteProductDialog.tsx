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
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="text-destructive size-5" />
            Delete {product?.name}?
          </DialogTitle>
          <DialogDescription>
            This permanently removes the product and all of its sales entries. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
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
