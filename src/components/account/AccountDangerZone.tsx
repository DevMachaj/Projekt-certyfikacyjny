import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteAccountDialog } from "@/components/account/DeleteAccountDialog";

interface Props {
  email: string;
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
 * Danger-zone island: owns the delete-account interaction. On success the account (and all its
 * data, via DB cascade) is gone and the session is cleared server-side, so we hard-navigate to the
 * landing page. On failure the session is preserved — the error surfaces inline and the dialog
 * stays open for a retry.
 */
export function AccountDangerZone({ email }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        setError(await readError(res, "Could not delete your account. Please try again."));
        return;
      }
      // Account deleted and session cleared server-side — leave the app entirely.
      window.location.href = "/";
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-6">
      <h2 className="text-destructive text-lg font-semibold">Danger zone</h2>
      <p className="text-muted-foreground mt-1 mb-4 text-sm">
        Permanently delete your account and all associated data. This cannot be undone.
      </p>
      <Button
        variant="destructive"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="gap-2"
      >
        <Trash2 className="size-4" />
        Delete account
      </Button>

      <DeleteAccountDialog
        open={open}
        email={email}
        pending={pending}
        error={error}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          setOpen(false);
        }}
      />
    </div>
  );
}
