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
    <div className="rounded-2xl border border-red-500/30 bg-red-900/10 p-6">
      <h2 className="text-lg font-semibold text-red-300">Danger zone</h2>
      <p className="mt-1 mb-4 text-sm text-blue-100/70">
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
