import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fullName, rejectCandidate, rejectCandidates, type Candidate } from "@/lib/hiring";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function RejectCandidateDialog({
  candidates,
  onOpenChange,
  onRejected,
}: {
  candidates: Candidate[];
  onOpenChange: (open: boolean) => void;
  onRejected: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const open = candidates.length > 0;
  const singleCandidate = candidates.length === 1 ? candidates[0] : undefined;

  useEffect(() => {
    if (!open) return;
    setReason("");
    setError(null);
  }, [open]);

  async function confirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("A rejection reason is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
     let successMessage: string;
      if (singleCandidate) {
        await rejectCandidate(singleCandidate, trimmed);
        successMessage = `${fullName(singleCandidate)} rejected`;
      } else {
        await rejectCandidates(candidates, trimmed);
        successMessage = `${candidates.length} candidates rejected`;
      }
      toast.success(successMessage);
      
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["candidates"] }),
        queryClient.invalidateQueries({ queryKey: ["interviews"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
      onRejected();
      onOpenChange(false);
    } catch (e) {
      toast.error(messageFrom(e, "Could not reject the candidate"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {singleCandidate
              ? `Reject ${fullName(singleCandidate)}`
              : `Reject ${candidates.length} candidates`}
          </DialogTitle>
          <DialogDescription>
            This moves the candidate(s) to the Rejected stage. Scheduled interviews will be
            cancelled and retained in history. Provide a reason for the record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reject-reason">Reason</Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this candidate being rejected?"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={saving || !reason.trim()}>
            {saving ? "Rejecting…" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
