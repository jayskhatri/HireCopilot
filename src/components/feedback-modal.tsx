import type { FeedbackOutcome } from "@/components/feedback-outcome-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { analyzeFeedback } from "@/lib/feedback.functions";
import { logActivity } from "@/lib/hiring";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const RUBRIC = [
  "Core language & framework depth",
  "Data modelling and SQL proficiency",
  "System design and scalability thinking",
  "Code quality, testing and reviews",
  "Debugging and problem decomposition",
  "API & integration design",
  "Cloud, CI/CD and operational awareness",
  "Ownership and delivery track record",
  "Communication and stakeholder clarity",
  "Culture add and collaboration",
];

export type FeedbackTarget = {
  interviewId: string;
  candidateId: string;
  candidateName: string;
  role: string;
  round: string;
};

export const riskStyles: Record<string, string> = {
  LOW: "bg-success/10 text-success border-success/30",
  MEDIUM: "bg-warning/15 text-warning-foreground border-warning/40",
  HIGH: "bg-destructive/10 text-destructive border-destructive/30",
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export function FeedbackModal({
  target,
  onOpenChange,
  onSubmitted,
}: {
  target: FeedbackTarget | null;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: (outcome: FeedbackOutcome) => void;
}) {
  const analyze = useServerFn(analyzeFeedback);
  const queryClient = useQueryClient();
  const [scores, setScores] = useState<number[]>(() => RUBRIC.map(() => 7));
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const average = useMemo(() => scores.reduce((a, b) => a + b, 0) / scores.length, [scores]);

  function reset() {
    setScores(RUBRIC.map(() => 7));
    setComments("");
  }

  async function submit() {
    if (!target) return;
    setSubmitting(true);
    try {
      const result = await analyze({
        data: {
          interviewId: target.interviewId,
          candidateName: target.candidateName,
          role: target.role,
          round: target.round,
          rubric: RUBRIC.map((question, i) => ({ question, score: scores[i] ?? 5 })),
          comments,
        },
      });

      const db = supabase;
      const { error } = await db.from("interview_feedback").insert({
        interview_id: target.interviewId,
        decision: result.recommendation,
        overall_score: result.overall_score,
        rubric_responses: RUBRIC.map((question, i) => ({ question, score: scores[i] })),
        summary_comments: comments,
        risk_level: result.risk_level,
        risk_rationale: result.risk_rationale,
      });
      if (error) {
        if (isUniqueViolation(error)) {
          toast.error("Feedback has already been submitted for this interview.");
          await queryClient.invalidateQueries({ queryKey: ["feedback"] });
          reset();
          onOpenChange(false);
          return;
        }
        throw error;
      }

      const { data: interviewRow, error: interviewError } = await db
        .from("interviews")
        .select("booking_group_id")
        .eq("id", target.interviewId)
        .maybeSingle();
      if (interviewError) throw interviewError;

      const bookingGroupId = interviewRow?.booking_group_id;
      let interviewUpdate = db.from("interviews").update({ status: "COMPLETED" });
      interviewUpdate = bookingGroupId
        ? interviewUpdate.eq("booking_group_id", bookingGroupId)
        : interviewUpdate.eq("id", target.interviewId);
      const { error: statusError } = await interviewUpdate;
      if (statusError) throw statusError;

      await logActivity(target.candidateId, "FEEDBACK_SUBMITTED", {
        round: target.round,
        overall_score: result.overall_score,
        risk_level: result.risk_level,
        recommendation: result.recommendation,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["interviews"] }),
        queryClient.invalidateQueries({ queryKey: ["feedback"] }),
        queryClient.invalidateQueries({ queryKey: ["activity", target.candidateId] }),
      ]);
      toast.success(`Feedback saved · ${result.recommendation} · risk ${result.risk_level}`);
      onSubmitted?.({
        candidateId: target.candidateId,
        candidateName: target.candidateName,
        round: target.round,
        analysis: result,
      });
      reset();
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not save feedback");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            Interview feedback · {target?.candidateName}
          </DialogTitle>
          <DialogDescription>
            {target?.round} · {target?.role} — score each JD-aligned criterion from 1 to 10.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Live average</p>
            <p className="font-display text-2xl font-semibold">{average.toFixed(1)} / 10</p>
          </div>
          <Badge
            variant="outline"
            className={cn(riskStyles[average < 6 ? "HIGH" : average < 7 ? "MEDIUM" : "LOW"])}
          >
            Projected risk: {average < 6 ? "HIGH" : average < 7 ? "MEDIUM" : "LOW"}
          </Badge>
        </div>

        <div className="space-y-4">
          {RUBRIC.map((question, i) => (
            <div key={question} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {i + 1}. {question}
                </span>
                <span className="tabular-nums text-muted-foreground">{scores[i]}/10</span>
              </div>
              <Slider
                value={[scores[i] ?? 5]}
                min={1}
                max={10}
                step={1}
                onValueChange={([value]) =>
                  setScores((prev) => prev.map((s, idx) => (idx === i ? (value ?? s) : s)))
                }
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Interviewer notes</label>
          <Textarea
            rows={4}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Strengths, concerns, red flags, and anything you could not verify…"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Submit & run AI risk check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
