import { useState } from "react";
import { TriangleAlert, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  open: boolean;
  /** The signed-in user's email — the value that must be typed to enable deletion. */
  email: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation modal for the irreversible account deletion. Unlike DeleteProductDialog, deletion
 * is gated behind typing the exact account email (strong guard for an account-level destructive
 * action) and the dialog can surface a server error inline (the request keeps the session on
 * failure, so the user retries here).
 */
export function DeleteAccountDialog({ open, email, pending, error, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState("");

  const confirmed = typed === email;

  // Reset the confirmation field on every close path (Cancel button, overlay, Escape) so a
  // reopen starts clean.
  function handleCancel() {
    setTyped("");
    onCancel();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel();
      }}
    >
      <DialogContent className="border-white/10 bg-slate-900 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-red-400" />
            Delete your account?
          </DialogTitle>
          <DialogDescription className="text-blue-100/70">
            This permanently removes your account and all of your products and sales entries. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <FormField
            id="confirm-email"
            label={`Type ${email} to confirm`}
            type="email"
            value={typed}
            onChange={setTyped}
            placeholder={email}
            icon={<Mail className="size-4" />}
          />
          <ServerError message={error} />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={pending}
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending || !confirmed}>
            {pending ? "Deleting..." : "Delete account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
