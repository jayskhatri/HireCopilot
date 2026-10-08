import { AppShell } from "@/components/app-shell";
import {
    DeletePositionDialog,
    PositionCsvImportDialog,
    PositionFormDialog,
    PositionStatusDialog,
} from "@/components/position-form-dialog";
import { ResponsiveDetailPanel } from "@/components/responsive-detail-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    candidatesQuery,
    departmentsQuery,
    formatDate,
    formatTime,
    fullName,
    initials,
    interviewsQuery,
    jobsQuery,
    STAGE_LABEL,
    type Candidate,
    type Interview,
    type Job,
    type PositionStatus,
} from "@/lib/hiring";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
    BriefcaseBusiness,
    CalendarClock,
    CheckCircle2,
    Eye,
    LockKeyhole,
    MapPin,
    Pencil,
    Plus,
    RotateCcw,
    Search,
    Trash2,
    Upload,
    Users,
    X,
} from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/open-positions")({
  head: () => ({
    meta: [
      { title: "Open Positions — HireCopilot" },
      {
        name: "description",
        content:
          "Manage recruiter-facing job codes, departments, active openings and linked candidates.",
      },
      { property: "og:title", content: "Open Positions — HireCopilot" },
      {
        property: "og:description",
        content: "Track openings, job codes and candidate assignment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OpenPositionsPage,
});

function statusClass(status: string) {
  return status === "OPEN"
    ? "border-success/25 bg-success/10 text-success"
    : "border-muted bg-muted text-muted-foreground";
}

function interviewEventKey(interview: Interview) {
  return interview.booking_group_id || interview.id;
}

function countUpcomingInterviewEvents(interviews: Interview[], jobId?: string) {
  return new Set(
    interviews
      .filter(
        (interview) =>
          isUpcomingScheduledInterview(interview) && (!jobId || interview.job_id === jobId),
      )
      .map(interviewEventKey),
  ).size;
}

function interviewFor(candidate: Candidate, jobId: string, interviews: Interview[]) {
  const rows = interviews
    .filter((interview) => interview.candidate_id === candidate.id && interview.job_id === jobId)
    .sort((a, b) => new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime());
  return (
    rows.find(
      (interview) =>
        interview.status === "SCHEDULED" &&
        new Date(interview.scheduled_start).getTime() >= Date.now(),
    ) ?? rows[0]
  );
}

function isUpcomingScheduledInterview(interview: Interview) {
  return (
    interview.status === "SCHEDULED" && new Date(interview.scheduled_start).getTime() >= Date.now()
  );
}

const EMPTY_JOBS: Job[] = [];
const EMPTY_CANDIDATES: Candidate[] = [];
const EMPTY_INTERVIEWS: Interview[] = [];

function OpenPositionsPage() {
  const jobs = useQuery(jobsQuery);
  const departments = useQuery(departmentsQuery);
  const candidates = useQuery(candidatesQuery);
  const interviews = useQuery(interviewsQuery);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("open");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [selected, setSelected] = useState<Job | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ job: Job; status: PositionStatus } | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);

  const list = jobs.data ?? EMPTY_JOBS;
  const candidateList = candidates.data ?? EMPTY_CANDIDATES;
  const interviewList = interviews.data ?? EMPTY_INTERVIEWS;
  const filtered = useMemo(() => {
    return list.filter((job) => {
      const haystack =
        `${job.job_code} ${job.title} ${job.department} ${job.location} ${job.required_skills.join(" ")}`.toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (tab !== "all" && job.status.toLowerCase() !== tab) return false;
      if (departmentId !== "ALL" && job.department_id !== departmentId) return false;
      return true;
    });
  }, [list, search, tab, departmentId]);

  const active = selected;
  const activeCandidates = active
    ? candidateList.filter((candidate) => candidate.job_id === active.id)
    : [];
  const activeInterviews = active
    ? interviewList.filter((interview) => interview.job_id === active.id)
    : [];
  const stats = [
    {
      label: "Open positions",
      value: list.filter((job) => job.status === "OPEN").length,
      sub: "actively recruiting",
    },
    {
      label: "Closed positions",
      value: list.filter((job) => job.status === "CLOSED").length,
      sub: "kept for history",
    },
    {
      label: "Assigned candidates",
      value: candidateList.filter((candidate) => candidate.job_id).length,
      sub: "linked to roles",
    },
    {
      label: "Scheduled interviews",
      value: countUpcomingInterviewEvents(interviewList),
      sub: "upcoming rounds",
    },
  ];

  return (
    <AppShell
      title="Open Positions"
      subtitle="Manage position codes, ownership and linked candidate activity."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" /> Import CSV
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Open position
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="gap-0 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.sub}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-5 xl:flex-row">
        <Card className="min-w-0 flex-1 gap-0 p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="closed">Closed</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full min-w-0 flex-1 sm:min-w-56">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search code, title, department, skill..."
                className="pl-9"
              />
            </div>
            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto"
            >
              <option value="ALL">All departments</option>
              {(departments.data ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Position</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Pipeline</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Opened</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((job) => {
                  const linkedCandidates = candidateList.filter(
                    (candidate) => candidate.job_id === job.id,
                  ).length;
                  const linkedInterviews = countUpcomingInterviewEvents(interviewList, job.id);
                  return (
                    <tr
                      key={job.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/40",
                        active?.id === job.id && "bg-accent/40",
                      )}
                      onClick={() => setSelected(job)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{job.job_code}</p>
                        <p className="text-xs text-muted-foreground">{job.title}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {job.departments?.name ?? job.department}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{job.location}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {linkedCandidates} candidates · {linkedInterviews} interviews
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={statusClass(job.status)}>
                          {job.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(job.open_since)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Eye className="inline size-4 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="p-6 text-sm text-muted-foreground">
                <p>No positions match these filters.</p>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto gap-1 px-0"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="size-4" /> Open a position
                </Button>
              </div>
            )}
          </div>
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Showing {filtered.length} of {list.length} positions
          </div>
        </Card>

        {active && (
          <ResponsiveDetailPanel
            title={`${active.job_code} details`}
            onClose={() => setSelected(null)}
          >
            <Card className="w-full shrink-0 gap-0 self-start p-5 xl:w-[420px]">
              <div className="flex items-start gap-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BriefcaseBusiness className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-semibold">{active.job_code}</p>
                  <p className="text-sm text-muted-foreground">{active.title}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditing(active);
                      setFormOpen(true);
                    }}
                    aria-label="Edit position"
                    className="rounded-md p-1 hover:bg-muted"
                  >
                    <Pencil className="size-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() =>
                      setStatusTarget({
                        job: active,
                        status: active.status === "OPEN" ? "CLOSED" : "OPEN",
                      })
                    }
                    aria-label={active.status === "OPEN" ? "Close position" : "Reopen position"}
                    className="rounded-md p-1 hover:bg-muted"
                  >
                    {active.status === "OPEN" ? (
                      <LockKeyhole className="size-4 text-muted-foreground" />
                    ) : (
                      <RotateCcw className="size-4 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(active)}
                    aria-label="Delete position"
                    className="rounded-md p-1 hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </button>
                  <button
                    onClick={() => setSelected(null)}
                    aria-label="Close"
                    className="rounded-md p-1 hover:bg-muted"
                  >
                    <X className="size-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Department</p>
                  <p className="font-medium">{active.departments?.name ?? active.department}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className={cn("mt-1", statusClass(active.status))}>
                    {active.status}
                  </Badge>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Candidates</p>
                  <p className="font-display text-xl font-semibold">{activeCandidates.length}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Interviews</p>
                  <p className="font-display text-xl font-semibold">
                    {countUpcomingInterviewEvents(activeInterviews, active.id)}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <MapPin className="size-4" /> {active.location}
                </p>
                <p className="flex items-center gap-2">
                  <CalendarClock className="size-4" /> Opened {formatDate(active.open_since)}
                </p>
              </div>

              <Separator className="my-4" />

              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Required skills
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {active.required_skills.map((skill) => (
                  <Badge key={skill} variant="secondary">
                    {skill}
                  </Badge>
                ))}
              </div>

              {active.description && (
                <p className="mt-4 text-sm text-muted-foreground">{active.description}</p>
              )}

              <Separator className="my-4" />

              <p className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4" /> Linked candidates
              </p>
              <div className="mt-3 divide-y divide-border">
                {activeCandidates.map((candidate) => {
                  const interview = interviewFor(candidate, active.id, interviewList);
                  return (
                    <div key={candidate.id} className="flex items-start gap-3 py-3">
                      <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                        {initials(fullName(candidate))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{fullName(candidate)}</p>
                        <p className="text-xs text-muted-foreground">{candidate.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {STAGE_LABEL[candidate.current_stage]}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {interview
                            ? `${interview.status} ${interview.stage} · ${formatDate(interview.scheduled_start)} ${formatTime(interview.scheduled_start)}`
                            : "No interview yet"}
                        </p>
                        {interview?.interviewers && (
                          <p className="text-xs text-muted-foreground">
                            {`${interview.interviewers.name} · ${interview.interviewers.title} · ${interview.interviewers.email}`}
                          </p>
                        )}
                      </div>
                      <Link
                        to="/orchestrator"
                        search={{ candidateId: candidate.id }}
                        className="rounded-md p-1.5 hover:bg-muted"
                        aria-label="Schedule interview"
                      >
                        <CheckCircle2 className="size-4 text-muted-foreground" />
                      </Link>
                    </div>
                  );
                })}
                {!activeCandidates.length && (
                  <p className="py-3 text-sm text-muted-foreground">No candidates assigned yet.</p>
                )}
              </div>
            </Card>
          </ResponsiveDetailPanel>
        )}
      </div>

      <PositionFormDialog open={formOpen} onOpenChange={setFormOpen} job={editing} />
      <PositionCsvImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <PositionStatusDialog
        job={statusTarget?.job ?? null}
        status={statusTarget?.status ?? "CLOSED"}
        onOpenChange={(open) => !open && setStatusTarget(null)}
      />
      <DeletePositionDialog
        job={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </AppShell>
  );
}
