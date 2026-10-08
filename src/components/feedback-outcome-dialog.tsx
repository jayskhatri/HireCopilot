import { riskStyles } from "@/components/feedback-modal";
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
import type { FeedbackAnalysisResult } from "@/lib/feedback.functions";
import { nextStageAfter, STAGE_LABEL } from "@/lib/hiring";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";

export type FeedbackOutcome = {
  candidateId: string;
  candidateName: string;
  round: string;
  analysis: FeedbackAnalysisResult;
};

type OutcomeVariant = {
  title: string;
  body: string;
  schedule: { label: string; emphasis: "primary" | "secondary" } | null;
  closeLabel: string;
  closeEmphasis: "primary" | "secondary";
};

function resolveVariant(
  outcome: FeedbackOutcome,
  nextRoundLabel: string | null,
  roundLabel: string,
): OutcomeVariant {
  const { candidateName, round, analysis } = outcome;

  if (round === "L3") {
    return {
      title: "L3 complete — reject or make an offer",
      body: `${candidateName} has finished the final round. Move them to Offer, or reject them, from the Candidates page. No further interview rounds are required.`,
      schedule: null,
      closeLabel: "Close",
      closeEmphasis: "primary",
    };
  }

  if (nextRoundLabel) {
    if (analysis.recommendation === "SELECT") {
      return {
        title: "Positive feedback — schedule the next round",
        body: `${candidateName} cleared ${roundLabel}. Please schedule the ${nextRoundLabel} round to keep the pipeline moving. The candidate will move stage once the next round is booked.`,
        schedule: { label: `Schedule ${nextRoundLabel}`, emphasis: "primary" },
        closeLabel: "Not now",
        closeEmphasis: "secondary",
      };
    }

    if (analysis.recommendation === "BORDERLINE") {
      return {
        title: "Borderline result — your call",
        body: `${candidateName}'s ${roundLabel} result is borderline. Review the notes with the panel. If you want to continue, schedule the ${nextRoundLabel} round.`,
        schedule: { label: `Schedule ${nextRoundLabel}`, emphasis: "primary" },
        closeLabel: "Decide later",
        closeEmphasis: "secondary",
      };
    }

    if (analysis.recommendation === "REJECT") {
      return {
        title: "Rejection recommended",
        body: `The analysis recommends rejecting ${candidateName} after ${roundLabel}. You can reject them from the Candidates page, or override and schedule the ${nextRoundLabel} round.`,
        schedule: { label: `Schedule ${nextRoundLabel} anyway`, emphasis: "secondary" },
        closeLabel: "Close",
        closeEmphasis: "primary",
      };
    }
  }

  return {
    title: "Feedback saved",
    body: `Feedback for ${candidateName} has been recorded.`,
    schedule: null,
    closeLabel: "Close",
    closeEmphasis: "primary",
  };
}

export function FeedbackOutcomeDialog({
  outcome,
  onOpenChange,
}: {
  outcome: FeedbackOutcome | null;
  onOpenChange: (open: boolean) => void;
}) {
  const analysis = outcome?.analysis ?? null;
  const nextStage = outcome ? nextStageAfter(outcome.round) : null;
  const nextRoundLabel = nextStage ? (STAGE_LABEL[nextStage] ?? nextStage) : null;
  const roundLabel = outcome ? (STAGE_LABEL[outcome.round] ?? outcome.round) : "";
  const variant = outcome ? resolveVariant(outcome, nextRoundLabel, roundLabel) : null;

  return (
    <Dialog open={!!outcome} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        {outcome && analysis && variant && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">{variant.title}</DialogTitle>
              <DialogDescription>
                Overall {analysis.overall_score}/10 · Risk {analysis.risk_level} · Recommendation{" "}
                {analysis.recommendation}
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm">{variant.body}</p>

            <div className="space-y-2 rounded-xl border border-border bg-accent/40 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-primary" /> AI risk analysis
                {!analysis.aiGenerated && (
                  <Badge variant="outline" className="text-[10px]">
                    {analysis.aiDisabled ? "rules-based" : "offline scoring"}
                  </Badge>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className={riskStyles[analysis.risk_level]}>
                  {analysis.risk_level === "HIGH" ? (
                    <AlertTriangle className="mr-1 size-3" />
                  ) : (
                    <CheckCircle2 className="mr-1 size-3" />
                  )}
                  Risk {analysis.risk_level}
                </Badge>
                <Badge variant="secondary">Score {analysis.overall_score}</Badge>
                <Badge variant="secondary">{analysis.recommendation}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{analysis.risk_rationale}</p>
              {!!analysis.concerns?.length && (
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {analysis.concerns.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>

            {!analysis.aiGenerated && (
              <p className="text-xs text-muted-foreground">
                {analysis.aiDisabled
                  ? "Scored by rubric rules — AI risk analysis is turned off in Configuration."
                  : "Scored locally — AI analysis was unavailable."}
              </p>
            )}

            <DialogFooter>
              {variant.closeEmphasis === "secondary" && (
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {variant.closeLabel}
                </Button>
              )}
              {variant.schedule && (
                <Button
                  asChild
                  variant={variant.schedule.emphasis === "primary" ? "default" : "outline"}
                >
                  <Link
                    to="/orchestrator"
                    search={{ candidateId: outcome.candidateId }}
                    onClick={() => onOpenChange(false)}
                  >
                    {variant.schedule.label}
                  </Link>
                </Button>
              )}
              {variant.closeEmphasis === "primary" && (
                <Button onClick={() => onOpenChange(false)}>{variant.closeLabel}</Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
