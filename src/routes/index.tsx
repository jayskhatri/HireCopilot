import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  averageHiringCycleDays,
  candidatesQuery,
  countUniqueStageTransitionsOnLocalDay,
  dashboardActivityQuery,
  daysInStage,
  feedbackQuery,
  formatTime,
  fullName,
  initials,
  interviewsQuery,
  isSameLocalMonth,
  isToday,
  jobsQuery,
  slaLevel,
  STAGE_LABEL,
  STAGES,
} from "@/lib/hiring";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  Clock,
  FileCheck2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { ComponentType } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HireCopilot — Autonomous Hiring Command Center" },
      {
        name: "description",
        content:
          "Live hiring command center: pipeline SLAs, AI interview orchestration, Teams copilot and interview risk scoring.",
      },
      { property: "og:title", content: "HireCopilot — Autonomous Hiring Command Center" },
      {
        property: "og:description",
        content:
          "AI-run hiring operations: pipeline, scheduling, feedback risk and a Teams copilot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Kpi({
  icon: Icon,
  label,
  value,
  badge,
  tone,
  isLoading = false,
  isError = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  badge?: string | undefined;
  tone: "primary" | "info" | "success" | "warning" | "destructive";
  isLoading?: boolean;
  isError?: boolean;
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    info: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <Card className="gap-0 p-4">
      <div className="flex items-start justify-between">
        <div className={`flex size-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="size-5" />
        </div>
        {badge && (
          <Badge variant="outline" className="text-[11px]">
            {badge}
          </Badge>
        )}
      </div>
      {isError ? (
        <p className="mt-3 font-display text-xl font-semibold tabular-nums">Unavailable</p>
      ) : isLoading ? (
        <Skeleton className="mt-3 h-9 w-24" />
      ) : (
        <p className="mt-3 font-display text-3xl font-semibold tabular-nums">{value}</p>
      )}
      <p className="text-sm text-muted-foreground">{label}</p>
    </Card>
  );
}

function Home() {
  const candidates = useQuery(candidatesQuery);
  const interviews = useQuery(interviewsQuery);
  const jobs = useQuery(jobsQuery);
  const feedback = useQuery(feedbackQuery);
  const activity = useQuery(dashboardActivityQuery);

  const list = candidates.data ?? [];
  const now = new Date();
  const todays = (interviews.data ?? []).filter(
    (interview) => interview.status === "SCHEDULED" && isToday(interview.scheduled_start),
  );
  const interviewsToday = new Set(todays.map((interview) => interview.candidate_id)).size;
  const openJobs = (jobs.data ?? []).filter((job) => job.status === "OPEN");
  const openedThisMonth = openJobs.filter((job) => isSameLocalMonth(job.open_since, now)).length;
  const offersToday = countUniqueStageTransitionsOnLocalDay(activity.data ?? [], "OFFER", now);
  const highRiskCandidateIds = new Set(
    (feedback.data ?? [])
      .filter((entry) => entry.risk_level === "HIGH")
      .map((entry) => entry.interviews?.candidate_id)
      .filter((candidateId): candidateId is string => Boolean(candidateId)),
  );
  const highRiskCandidates = list.filter(
    (candidate) =>
      highRiskCandidateIds.has(candidate.id) &&
      !["OFFER", "REJECTED"].includes(candidate.current_stage),
  ).length;
  const averageCycleDays = averageHiringCycleDays(activity.data ?? []);
  const averageCycleValue =
    averageCycleDays === null
      ? "No data"
      : `${averageCycleDays} ${averageCycleDays === 1 ? "day" : "days"}`;
  const stuck = list
    .filter((c) => !["OFFER", "REJECTED"].includes(c.current_stage) && daysInStage(c) > 3)
    .sort((a, b) => daysInStage(b) - daysInStage(a));

  const stageCounts = STAGES.map((stage) => ({
    stage,
    count: list.filter((c) => c.current_stage === stage).length,
  }));
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.count));

  return (
    <AppShell
      title="Executive Hiring Command Center"
      subtitle="Everything AI is running for your hiring org right now"
      actions={
        <Button asChild variant="outline">
          <Link to="/orchestrator" search={{ candidateId: undefined }}>
            Schedule an interview
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          icon={Briefcase}
          label="Open positions"
          value={String(openJobs.length)}
          badge={jobs.data && !jobs.isError ? `${openedThisMonth} opened this month` : undefined}
          tone="primary"
          isLoading={jobs.isPending}
          isError={jobs.isError}
        />
        <Kpi
          icon={CalendarDays}
          label="Interviews scheduled today"
          value={String(interviewsToday)}
          badge="Today"
          tone="info"
          isLoading={interviews.isPending}
          isError={interviews.isError}
        />
        <Kpi
          icon={FileCheck2}
          label="Offers given today"
          value={String(offersToday)}
          badge="Today"
          tone="success"
          isLoading={activity.isPending}
          isError={activity.isError}
        />
        <Kpi
          icon={ShieldAlert}
          label="High-risk candidates"
          value={String(highRiskCandidates)}
          tone="destructive"
          isLoading={candidates.isPending || feedback.isPending}
          isError={candidates.isError || feedback.isError}
        />
        <Kpi
          icon={Clock}
          label="Average hiring cycle"
          value={averageCycleValue}
          tone="warning"
          isLoading={activity.isPending}
          isError={activity.isError}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Card className="gap-0 p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Sparkles className="size-4 text-primary" /> AI Priority Center
              </h2>
              <p className="text-sm text-muted-foreground">
                Candidates breaching the 3-day stage SLA — act on these first.
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-destructive/30 bg-destructive/10 text-destructive"
            >
              {stuck.length} at risk
            </Badge>
          </div>

          <div className="mt-4 divide-y divide-border">
            {stuck.slice(0, 6).map((c) => {
              const days = daysInStage(c);
              const level = slaLevel(days);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                    {initials(fullName(c))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{fullName(c)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.jobs?.title ?? "Unassigned"} · {STAGE_LABEL[c.current_stage]}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      level === "breach"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-warning/40 bg-warning/15 text-warning-foreground"
                    }
                  >
                    <AlertTriangle className="mr-1 size-3" /> {days}d in stage
                  </Badge>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/orchestrator" search={{ candidateId: c.id }}>
                      Schedule <ArrowUpRight className="ml-1 size-3" />
                    </Link>
                  </Button>
                </div>
              );
            })}
            {!stuck.length && (
              <p className="py-6 text-sm text-muted-foreground">
                No SLA breaches. Pipeline is healthy.
              </p>
            )}
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="text-base font-semibold">Interviews today</h2>
          <p className="text-sm text-muted-foreground">Live from the orchestrator</p>
          <div className="mt-4 space-y-3">
            {todays.map((i) => (
              <div key={i.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {i.candidates
                      ? `${i.candidates.first_name} ${i.candidates.last_name}`
                      : "Candidate"}
                  </p>
                  <Badge variant="secondary">{i.stage}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatTime(i.scheduled_start)} · {i.interviewers?.name ?? "Unassigned"} ·{" "}
                  {i.status.toLowerCase()}
                </p>
              </div>
            ))}
            {!todays.length && (
              <p className="text-sm text-muted-foreground">Nothing scheduled for today yet.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="gap-0 p-5 lg:col-span-2">
          <h2 className="text-base font-semibold">Pipeline funnel</h2>
          <div className="mt-4 space-y-3">
            {stageCounts.map((s) => (
              <div key={s.stage}>
                <div className="flex items-center justify-between text-sm">
                  <span>{STAGE_LABEL[s.stage]}</span>
                  <span className="tabular-nums text-muted-foreground">{s.count}</span>
                </div>
                <Progress value={(s.count / maxStage) * 100} className="mt-1.5 h-2" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="text-base font-semibold">Positions needing attention</h2>
          <div className="mt-4 space-y-3">
            {(jobs.data ?? [])
              .map((j) => ({
                ...j,
                days: Math.floor((Date.now() - new Date(j.open_since).getTime()) / 86400000),
              }))
              .sort((a, b) => b.days - a.days)
              .slice(0, 5)
              .map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{j.title}</p>
                    <p className="text-xs text-muted-foreground">{j.department}</p>
                  </div>
                  <Badge variant={j.days > 25 ? "destructive" : "secondary"}>{j.days}d open</Badge>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
