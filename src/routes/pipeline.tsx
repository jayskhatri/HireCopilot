import { AppShell } from "@/components/app-shell";
import { FeedbackModal, type FeedbackTarget } from "@/components/feedback-modal";
import { FeedbackOutcomeDialog, type FeedbackOutcome } from "@/components/feedback-outcome-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  candidatesQuery,
  daysInStage,
  derivePipelineCardState,
  feedbackQuery,
  fullName,
  initials,
  interviewsQuery,
  positionLabel,
  resolveFeedbackInterviewPosition,
  slaLevel,
  STAGE_LABEL,
  STAGES,
  type PipelineIndicatorIcon,
  type PipelineIndicatorTone,
} from "@/lib/hiring";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  MessageSquarePlus,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const INDICATOR_TONE: Record<PipelineIndicatorTone, string> = {
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/15 text-warning-foreground border-warning/40",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
};

const INDICATOR_ICON: Record<PipelineIndicatorIcon, LucideIcon> = {
  "calendar-plus": CalendarPlus,
  "check-circle": CheckCircle2,
  "alert-triangle": AlertTriangle,
};

function ActionTooltip({
  content,
  focusable = false,
  children,
}: {
  content: string;
  focusable?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={focusable ? 0 : undefined}
          className={cn(
            "inline-flex flex-1 rounded-md",
            focusable && "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          )}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Candidate Pipeline — HireCopilot" },
      {
        name: "description",
        content: "Kanban pipeline across screening to offer with automatic SLA breach flagging.",
      },
      { property: "og:title", content: "Candidate Pipeline — HireCopilot" },
      {
        property: "og:description",
        content: "Kanban pipeline with automatic SLA breach flagging.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PipelinePage,
});

function PipelinePage() {
  const candidates = useQuery(candidatesQuery);
  const interviews = useQuery(interviewsQuery);
  const feedback = useQuery(feedbackQuery);
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget | null>(null);
  const [outcome, setOutcome] = useState<FeedbackOutcome | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const list = candidates.data ?? [];

  return (
    <AppShell
      title="Candidate Pipeline"
      subtitle="Every stage, every SLA — flagged the moment a candidate goes stale."
    >
      <TooltipProvider delayDuration={200}>
        <div className="flex max-w-full snap-x gap-4 overflow-x-auto pb-4">
          {STAGES.map((stage) => {
            const column = list.filter((c) => c.current_stage === stage);
            return (
              <div
                key={stage}
                className="w-[min(18rem,85vw)] shrink-0 snap-start rounded-xl border border-border bg-card p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">{STAGE_LABEL[stage]}</p>
                  <Badge variant="secondary">{column.length}</Badge>
                </div>
                <div className="space-y-3">
                  {column.map((c) => {
                    const days = daysInStage(c);
                    const level = slaLevel(days);
                    const card = derivePipelineCardState({
                      candidate: c,
                      interviews: interviews.data ?? [],
                      feedback: feedback.data ?? [],
                      now,
                      loading: interviews.isPending || feedback.isPending,
                      errored: interviews.isError || feedback.isError,
                    });
                    const IndicatorIcon = card.indicator
                      ? INDICATOR_ICON[card.indicator.icon]
                      : null;
                    return (
                      <div key={c.id} className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-start gap-2">
                          <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
                            {initials(fullName(c))}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{fullName(c)}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {c.jobs?.title ?? "Unassigned"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[11px] font-medium",
                              level === "breach"
                                ? "bg-destructive/10 text-destructive"
                                : level === "warning"
                                  ? "bg-warning/20 text-warning-foreground"
                                  : "text-muted-foreground",
                            )}
                          >
                            {level !== "ok" && <AlertTriangle className="mr-1 inline size-3" />}
                            {days}d in stage
                          </span>
                        </div>
                        {card.indicator && IndicatorIcon && (
                          <div className="mt-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "max-w-full gap-1",
                                    INDICATOR_TONE[card.indicator.tone],
                                  )}
                                >
                                  <IndicatorIcon className="size-3 shrink-0" />
                                  <span className="truncate">{card.indicator.label}</span>
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>{card.indicator.tooltip}</TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                        <div className="mt-2 flex gap-1">
                          <ActionTooltip
                            content={card.schedule.tooltip}
                            focusable={!card.schedule.enabled}
                          >
                            {card.schedule.enabled ? (
                              <Button
                                asChild
                                size="sm"
                                variant="ghost"
                                className="h-7 w-full px-2 text-xs"
                              >
                                <Link to="/orchestrator" search={{ candidateId: c.id }}>
                                  <CalendarPlus className="mr-1 size-3" /> Schedule
                                </Link>
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-full px-2 text-xs"
                                disabled
                              >
                                <CalendarPlus className="mr-1 size-3" /> Schedule
                              </Button>
                            )}
                          </ActionTooltip>
                          <ActionTooltip
                            content={card.feedback.tooltip}
                            focusable={!card.feedback.enabled}
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-full px-2 text-xs"
                              disabled={!card.feedback.enabled}
                              onClick={() =>
                                card.targetInterview &&
                                setFeedbackTarget({
                                  interviewId: card.targetInterview.id,
                                  candidateId: c.id,
                                  candidateName: fullName(c),
                                  role: positionLabel(
                                    resolveFeedbackInterviewPosition(card.targetInterview, c.jobs),
                                  ),
                                  round: card.targetInterview.stage,
                                })
                              }
                            >
                              <MessageSquarePlus className="mr-1 size-3" /> Feedback
                            </Button>
                          </ActionTooltip>
                        </div>
                      </div>
                    );
                  })}
                  {!column.length && (
                    <p className="py-4 text-center text-xs text-muted-foreground">No candidates</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </TooltipProvider>

      <FeedbackModal
        target={feedbackTarget}
        onOpenChange={(o) => !o && setFeedbackTarget(null)}
        onSubmitted={(next) => {
          setFeedbackTarget(null);
          setOutcome(next);
        }}
      />
      <FeedbackOutcomeDialog outcome={outcome} onOpenChange={(o) => !o && setOutcome(null)} />
    </AppShell>
  );
}
