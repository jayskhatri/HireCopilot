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
import { cancelInterview } from "@/lib/scheduling.functions";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export type CancelInterviewTarget = {
  bookingGroupId: string;
  candidateId: string;
  candidateName: string;
  stage: string;
  scheduledStart: string;
};

export function CancelInterviewDialog({
  target,
  onOpenChange,
  onCancelled,
}: {
  target: CancelInterviewTarget | null;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}) {
  const cancelInterviewFn = useServerFn(cancelInterview);
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const open = !!target;

  useEffect(() => {
    if (!open) return;
    setReason("");
  }, [open]);

  async function confirm() {
    if (!target) return;
    const trimmed = reason.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const result = await cancelInterviewFn({
        data: {
          bookingGroupId: target.bookingGroupId,
          candidateId: target.candidateId,
          reason: trimmed,
        },
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Interview cancelled.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["interviews"] }),
        queryClient.invalidateQueries({ queryKey: ["activity", target.candidateId] }),
      ]);
      onCancelled();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel the interview");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel interview</DialogTitle>
          <DialogDescription>
            This cancels {target?.candidateName}&apos;s {target?.stage} interview. Provide a reason
            for the record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="cancel-reason">Reason</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this interview being cancelled?"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Back
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={saving || !reason.trim()}>
            {saving ? "Cancelling…" : "Cancel interview"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
