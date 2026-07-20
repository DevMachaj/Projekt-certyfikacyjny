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

interface Props {
  /** Whether the confirmation is open — set by the parent on the "Delete selected" click. */
  open: boolean;
  /** Number of selected products, for the title/description text only. */
  count: number;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation modal for deleting multiple products at once. Mirrors DeleteProductDialog but is
 * driven by an explicit `open` boolean (NOT by `count > 0`, which is the bulk-bar-visible
 * condition). Warns that all associated sales entries are permanently removed (FR-011 — DB
 * ON DELETE CASCADE).
 */
export function BulkDeleteDialog({ open, count, pending, onConfirm, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="text-destructive size-5" />
            Delete {count} {count === 1 ? "product" : "products"}?
          </DialogTitle>
          <DialogDescription>
            This permanently removes the selected products and all of their sales entries. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Deleting..." : `Delete ${count} ${count === 1 ? "product" : "products"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
