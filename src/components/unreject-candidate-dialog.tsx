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
import {
  fullName,
  STAGE_LABEL,
  STAGES,
  unrejectCandidate,
  type Candidate,
  type Stage,
} from "@/lib/hiring";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const RESTORABLE_STAGES = STAGES.filter((s) => s !== "REJECTED");
const DEFAULT_RESTORE_STAGE: Stage = "SCREENING";

export function UnrejectCandidateDialog({
  candidate,
  onOpenChange,
  onUnrejected,
}: {
  candidate: Candidate | null;
  onOpenChange: (open: boolean) => void;
  onUnrejected: () => void;
}) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>(DEFAULT_RESTORE_STAGE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!candidate) return;
    setStage(DEFAULT_RESTORE_STAGE);
  }, [candidate]);

  async function confirm() {
    if (!candidate) return;
    setSaving(true);
    try {
      await unrejectCandidate(candidate.id, stage);
      toast.success(`${fullName(candidate)} restored to pipeline`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["candidates"] }),
        queryClient.invalidateQueries({ queryKey: ["interviews"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
      onUnrejected();
      onOpenChange(false);
    } catch (e) {
      toast.error(messageFrom(e, "Could not restore the candidate"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!candidate} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restore {candidate ? fullName(candidate) : ""}</DialogTitle>
          <DialogDescription>Pick the stage to restore this candidate into.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="unreject-stage">Stage</Label>
          <select
            id="unreject-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as Stage)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {RESTORABLE_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={saving}>
            {saving ? "Restoring…" : "Restore to pipeline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
