import { AppShell } from "@/components/app-shell";
import {
  CancelInterviewDialog,
  type CancelInterviewTarget,
} from "@/components/cancel-interview-dialog";
import { CandidateFiltersSheet } from "@/components/candidate-filters-sheet";
import {
  CandidateCsvImportDialog,
  CandidateFormDialog,
  DeleteCandidateDialog,
} from "@/components/candidate-form-dialog";
import { FeedbackModal, type FeedbackTarget } from "@/components/feedback-modal";
import { RejectCandidateDialog } from "@/components/reject-candidate-dialog";
import { ResponsiveDetailPanel } from "@/components/responsive-detail-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnrejectCandidateDialog } from "@/components/unreject-candidate-dialog";
import { useAppSettings } from "@/hooks/use-app-settings";
import {
  activityQuery,
  candidatesQuery,
  countActiveCandidateAdvancedFilters,
  createDefaultCandidateAdvancedFilters,
  daysInStage,
  deriveCandidateAdvancedFilterOptions,
  formatDate,
  formatTime,
  fullName,
  groupCandidateInterviews,
  initials,
  interviewsQuery,
  isSlaAtRisk,
  jobLabel,
  matchesCandidateAdvancedFilters,
  positionLabel,
  slaLevel,
  sortCandidates,
  STAGE_LABEL,
  STAGES,
  validateCandidateAdvancedFilters,
  type Candidate,
  type CandidateAdvancedFilters,
  type InterviewEventEntry,
} from "@/lib/hiring";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarPlus,
  Download,
  Eye,
  FileText,
  Filter,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Search,
  StickyNote,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const INTERVIEW_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
};

function interviewStatusLabel(status: string) {
  return INTERVIEW_STATUS_LABEL[status] ?? status.replaceAll("_", " ").toLowerCase();
}

function InterviewStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    SCHEDULED: "bg-info/10 text-info border-info/25",
    COMPLETED: "bg-success/10 text-success border-success/25",
    CANCELLED: "bg-muted text-muted-foreground border-border",
    NO_SHOW: "bg-destructive/10 text-destructive border-destructive/25",
  };

  return (
    <Badge variant="outline" className={map[status] ?? "border-border text-muted-foreground"}>
      {interviewStatusLabel(status)}
    </Badge>
  );
}

function interviewPanelLabel(event: InterviewEventEntry) {
  const panelMembers = [
    ...new Set(
      event.interviews
        .map((interview) => {
          if (!interview.interviewers?.name) return null;
          return interview.interviewers.title
            ? `${interview.interviewers.name} (${interview.interviewers.title})`
            : interview.interviewers.name;
        })
        .filter(Boolean),
    ),
  ] as string[];

  if (!panelMembers.length) return "Panel not assigned";
  return panelMembers.length === 1
    ? `Interviewer: ${panelMembers[0]}`
    : `Panel: ${panelMembers.join(", ")}`;
}

function positionMeta(candidate: Candidate) {
  if (!candidate.jobs) return "Unassigned";

  return [candidate.jobs.departments?.name ?? candidate.jobs.department, candidate.jobs.location]
    .filter(Boolean)
    .join(" · ");
}

function interviewScheduleLabel(event: InterviewEventEntry) {
  return `${STAGE_LABEL[event.stage] ?? event.stage} · ${formatDate(event.scheduled_start)} · ${formatTime(event.scheduled_start)} - ${formatTime(event.scheduled_end)}`;
}

function cloneAdvancedFilters(filters: CandidateAdvancedFilters): CandidateAdvancedFilters {
  return {
    ...filters,
    positionIds: [...filters.positionIds],
    departmentIds: [...filters.departmentIds],
    locations: [...filters.locations],
    sources: [...filters.sources],
    skills: [...filters.skills],
    slaBuckets: [...filters.slaBuckets],
  };
}

export const Route = createFileRoute("/candidates")({
  head: () => ({
    meta: [
      { title: "Candidates — HireCopilot" },
      {
        name: "description",
        content:
          "Search, filter and track every candidate with live stage, SLA and interview history.",
      },
      { property: "og:title", content: "Candidates — HireCopilot" },
      {
        property: "og:description",
        content: "Track every candidate with live stage and SLA data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CandidatesPage,
});

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, string> = {
    SCREENING: "bg-success/10 text-success border-success/25",
    L1: "bg-info/10 text-info border-info/25",
    L2: "bg-primary/10 text-primary border-primary/25",
    L3: "bg-accent text-accent-foreground border-primary/20",
    OFFER: "bg-warning/20 text-warning-foreground border-warning/40",
    REJECTED: "bg-destructive/10 text-destructive border-destructive/25",
  };
  return (
    <Badge variant="outline" className={map[stage]}>
      {STAGE_LABEL[stage]}
    </Badge>
  );
}

function CandidatesPage() {
  const candidates = useQuery(candidatesQuery);
  const interviews = useQuery(interviewsQuery);
  const { settings } = useAppSettings();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<string>("ALL");
  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CancelInterviewTarget | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Candidate | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectTargets, setRejectTargets] = useState<Candidate[]>([]);
  const [unrejectTarget, setUnrejectTarget] = useState<Candidate | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState(createDefaultCandidateAdvancedFilters);
  const [draftFilters, setDraftFilters] = useState(createDefaultCandidateAdvancedFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activity = useQuery(activityQuery(selected?.id ?? null));

  const list = useMemo(() => candidates.data ?? [], [candidates.data]);
  const advancedOptions = useMemo(
    () => deriveCandidateAdvancedFilterOptions(list, settings),
    [list, settings],
  );
  const advancedFilterCount = countActiveCandidateAdvancedFilters(advancedFilters);
  const draftFilterErrors = validateCandidateAdvancedFilters(draftFilters);
  const filtered = useMemo(() => {
    const now = Date.now();
    const matches = list.filter((c) => {
      const haystack =
        `${fullName(c)} ${c.email} ${c.jobs?.title ?? ""} ${c.skills.join(" ")}`.toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (stage !== "ALL" && c.current_stage !== stage) return false;
      if (tab === "rejected") {
        if (c.current_stage !== "REJECTED") return false;
      } else if (c.current_stage === "REJECTED") {
        return false;
      }
      if (tab === "risk" && slaLevel(daysInStage(c), settings) === "ok") return false;
      if (tab === "recent" && daysInStage(c) > 2) return false;
      if (tab === "offers" && c.current_stage !== "OFFER") return false;
      return matchesCandidateAdvancedFilters(c, advancedFilters, now, settings);
    });
    return sortCandidates(matches, advancedFilters.sort);
  }, [advancedFilters, list, search, settings, stage, tab]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab]);

  useEffect(() => {
    const filteredIds = new Set(filtered.map((c) => c.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => filteredIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    if (selected && !filteredIds.has(selected.id)) setSelected(null);
  }, [filtered, selected]);

  useEffect(() => {
    if (tab !== "rejected" && stage === "REJECTED") {
      setStage("ALL");
    }
  }, [tab, stage]);

  const selectedInterviews = useMemo(
    () => (interviews.data ?? []).filter((i) => i.candidate_id === selected?.id),
    [interviews.data, selected?.id],
  );
  const selectedInterviewEvents = useMemo(
    () => (selected ? groupCandidateInterviews(selected, interviews.data ?? []) : []),
    [interviews.data, selected],
  );

  const stats = [
    { label: "Total candidates", value: list.length, sub: "in database" },
    {
      label: "In pipeline",
      value: list.filter((c) => !["REJECTED", "OFFER"].includes(c.current_stage)).length,
      sub: "active rounds",
    },
    {
      label: "Offers",
      value: list.filter((c) => c.current_stage === "OFFER").length,
      sub: "pending sign",
    },
    {
      label: "SLA breaches",
      value: list.filter((c) => isSlaAtRisk(c, settings)).length,
      sub: `> ${settings.slaWarningDays} days in stage`,
    },
    {
      label: "Rejected",
      value: list.filter((c) => c.current_stage === "REJECTED").length,
      sub: "closed out",
    },
  ];

  return (
    <AppShell title="Candidates" subtitle="Manage and track all your candidates in one place.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="gap-0 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-5 xl:flex-row">
        <Card className="min-w-0 flex-1 gap-0 p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <Tabs value={tab} onValueChange={setTab} className="max-w-full overflow-x-auto">
              <TabsList>
                <TabsTrigger value="all">All candidates</TabsTrigger>
                <TabsTrigger value="risk">At risk</TabsTrigger>
                <TabsTrigger value="recent">Recent</TabsTrigger>
                <TabsTrigger value="offers">Offers</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full min-w-0 flex-1 sm:min-w-52">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, role, skill…"
                className="pl-9"
              />
            </div>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto"
            >
              <option value="ALL">All stages</option>
              {STAGES.filter((s) => s !== "REJECTED" || tab === "rejected").map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                setDraftFilters(cloneAdvancedFilters(advancedFilters));
                setFiltersOpen(true);
              }}
            >
              <Filter className="size-4" /> More filters
              {advancedFilterCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {advancedFilterCount}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setImportOpen(true)}
            >
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
              <UserPlus className="size-4" /> Add candidate
            </Button>
          </div>

          {tab !== "rejected" && selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
              <p className="text-sm text-muted-foreground">{selectedIds.size} selected</p>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setRejectTargets(filtered.filter((c) => selectedIds.has(c.id)))}
              >
                Reject selected
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {tab !== "rejected" && (
                    <th className="px-4 py-3">
                      <Checkbox
                        checked={
                          filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))
                        }
                        onCheckedChange={(checked) => {
                          setSelectedIds(checked ? new Set(filtered.map((c) => c.id)) : new Set());
                        }}
                        aria-label="Select all"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Position</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Time in stage</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Added on</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => {
                  const days = daysInStage(c);
                  const level = slaLevel(days, settings);
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/40",
                        selected?.id === c.id && "bg-accent/40",
                      )}
                      onClick={() => setSelected(c)}
                    >
                      {tab !== "rejected" && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(c.id)}
                            onCheckedChange={(checked) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(c.id);
                                else next.delete(c.id);
                                return next;
                              });
                            }}
                            aria-label={`Select ${fullName(c)}`}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                            {initials(fullName(c))}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{fullName(c)}</p>
                            <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.jobs ? jobLabel(c.jobs) : "Unassigned"}
                      </td>
                      <td className="px-4 py-3">
                        <StageBadge stage={c.current_stage} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-md px-2 py-1 text-xs font-medium",
                            level === "breach"
                              ? "bg-destructive/10 text-destructive"
                              : level === "warning"
                                ? "bg-warning/20 text-warning-foreground"
                                : "text-muted-foreground",
                          )}
                        >
                          {days} days
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.source}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(c.created_at)}
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
                <p>No candidates match these filters.</p>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto gap-1 px-0"
                  onClick={() => {
                    const defaults = createDefaultCandidateAdvancedFilters();
                    setSearch("");
                    setStage("ALL");
                    setTab("all");
                    setAdvancedFilters(defaults);
                    setDraftFilters(cloneAdvancedFilters(defaults));
                    setFiltersOpen(false);
                    setSelectedIds(new Set());
                    setSelected(null);
                  }}
                >
                  <X className="size-4" /> Clear all filters
                </Button>
              </div>
            )}
          </div>
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Showing {filtered.length} of {list.length} candidates
          </div>
        </Card>

        {selected && (
          <ResponsiveDetailPanel
            title={`${fullName(selected)} details`}
            onClose={() => setSelected(null)}
          >
            <Card className="w-full shrink-0 gap-0 self-start p-5 xl:w-96">
              <div className="flex items-start gap-3">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {initials(fullName(selected))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-semibold">{fullName(selected)}</p>
                  <p className="text-sm text-muted-foreground">
                    {selected.jobs ? jobLabel(selected.jobs) : "Unassigned"}
                  </p>
                  <p className="text-sm text-muted-foreground">{positionMeta(selected)}</p>
                </div>
                <div className="flex items-center gap-1">
                  {selected.current_stage === "REJECTED" ? (
                    <button
                      onClick={() => setUnrejectTarget(selected)}
                      aria-label="Un-reject candidate"
                      className="rounded-md p-1 hover:bg-muted"
                    >
                      <UserPlus className="size-4 text-muted-foreground" />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditing(selected);
                          setFormOpen(true);
                        }}
                        aria-label="Edit candidate"
                        className="rounded-md p-1 hover:bg-muted"
                      >
                        <Pencil className="size-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setRejectTargets([selected])}
                        aria-label="Reject candidate"
                        className="rounded-md p-1 hover:bg-destructive/10"
                      >
                        <X className="size-4 text-destructive" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setDeleteTarget(selected)}
                    aria-label="Delete candidate"
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

              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Mail className="size-4" /> {selected.email}
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="size-4" /> {selected.phone ?? "—"}
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="size-4" /> {selected.jobs?.location ?? "Unassigned"}
                </p>
              </div>

              <Separator className="my-4" />

              <p className="text-xs uppercase tracking-wide text-muted-foreground">Current stage</p>
              <div className="mt-2 flex items-center justify-between">
                <StageBadge stage={selected.current_stage} />
                <span
                  className={cn(
                    "text-sm font-medium",
                    slaLevel(daysInStage(selected), settings) !== "ok"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {daysInStage(selected)} days in stage
                </span>
              </div>

              {selected.current_stage === "REJECTED" && selected.rejection_reason && (
                <div className="mt-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                  {selected.rejection_reason}
                </div>
              )}

              <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">
                Interview history
              </p>
              <div className="mt-2 space-y-3 text-sm">
                {selectedInterviewEvents.length ? (
                  selectedInterviewEvents.map((event) => (
                    <div key={event.id} className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{positionLabel(event.position)}</p>
                            <InterviewStatusBadge status={event.status} />
                            {event.position.status === "CLOSED" && (
                              <Badge
                                variant="outline"
                                className="border-border text-muted-foreground"
                              >
                                Closed position
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground">{interviewScheduleLabel(event)}</p>
                          <p className="text-muted-foreground">
                            {event.position.isUnassigned
                              ? "No position was assigned for this interview."
                              : [
                                  event.position.departments?.name ?? event.position.department,
                                  event.position.location,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                          </p>
                          <p className="text-muted-foreground">{interviewPanelLabel(event)}</p>
                          {selected.current_stage === "REJECTED" &&
                            event.status === "SCHEDULED" && (
                              <p className="text-destructive">
                                Candidate is rejected. This scheduled round should be reviewed.
                              </p>
                            )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={event.status === "CANCELLED"}
                            onClick={() => {
                              const interview = event.interviews[0];
                              if (!interview) return;
                              setFeedbackTarget({
                                interviewId: interview.id,
                                candidateId: selected.id,
                                candidateName: fullName(selected),
                                role: positionLabel(event.position),
                                round: STAGE_LABEL[event.stage] ?? event.stage,
                              });
                            }}
                          >
                            Add feedback
                          </Button>
                          {event.status === "SCHEDULED" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                setCancelTarget({
                                  bookingGroupId: event.booking_group_id,
                                  candidateId: selected.id,
                                  candidateName: fullName(selected),
                                  stage: STAGE_LABEL[event.stage] ?? event.stage,
                                  scheduledStart: event.scheduled_start,
                                })
                              }
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-muted-foreground">
                    {selected.current_stage === "REJECTED"
                      ? "No interviews were booked before this candidate was rejected."
                      : "No interviews yet. Schedule the first round from the orchestrator."}
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg border border-border p-2">
                  <p className="text-muted-foreground">Experience</p>
                  <p className="font-medium">{selected.experience_years} yrs</p>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <p className="text-muted-foreground">Source</p>
                  <p className="font-medium">{selected.source}</p>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <p className="text-muted-foreground">Rounds</p>
                  <p className="font-medium">{selectedInterviewEvents.length}</p>
                </div>
              </div>

              <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">Skills</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selected.skills.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>

              <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">
                Documents
              </p>
              <div className="mt-2 space-y-2 text-sm">
                {selected.resume_url ? (
                  <a
                    href={selected.resume_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-primary hover:bg-muted/40"
                  >
                    <FileText className="size-4" /> Open resume
                    <Download className="ml-auto size-4" />
                  </a>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-muted-foreground">
                    No resume link provided.
                  </p>
                )}
              </div>

              <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">Activity</p>
              <div className="mt-2 space-y-2 text-sm">
                {(activity.data ?? []).slice(0, 6).map((a) => (
                  <div key={a.id} className="flex items-start gap-2">
                    <StickyNote className="mt-0.5 size-3.5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {a.action_type.replaceAll("_", " ").toLowerCase()}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(a.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                {selected.current_stage === "REJECTED" ? (
                  <Button size="sm" className="flex-1 gap-2" disabled>
                    <CalendarPlus className="size-4" /> Schedule
                  </Button>
                ) : (
                  <Button asChild size="sm" className="flex-1 gap-2">
                    <Link to="/orchestrator" search={{ candidateId: selected.id }}>
                      <CalendarPlus className="size-4" /> Schedule
                    </Link>
                  </Button>
                )}
                <Button size="sm" variant="outline" className="flex-1" disabled>
                  Feedback on interview entries
                </Button>
              </div>
            </Card>
          </ResponsiveDetailPanel>
        )}
      </div>

      <CandidateFiltersSheet
        open={filtersOpen}
        draft={draftFilters}
        options={advancedOptions}
        errors={draftFilterErrors}
        onOpenChange={(open) => {
          setFiltersOpen(open);
          if (!open) setDraftFilters(cloneAdvancedFilters(advancedFilters));
        }}
        onDraftChange={setDraftFilters}
        onClear={() => setDraftFilters(createDefaultCandidateAdvancedFilters())}
        onApply={() => {
          if (Object.keys(draftFilterErrors).length) return;
          setAdvancedFilters(cloneAdvancedFilters(draftFilters));
          setFiltersOpen(false);
        }}
      />
      <FeedbackModal target={feedbackTarget} onOpenChange={(o) => !o && setFeedbackTarget(null)} />
      <CandidateFormDialog open={formOpen} onOpenChange={setFormOpen} candidate={editing} />
      <CandidateCsvImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <DeleteCandidateDialog
        candidate={deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onDeleted={() => setSelected(null)}
      />
      <RejectCandidateDialog
        candidates={rejectTargets}
        onOpenChange={(o) => !o && setRejectTargets([])}
        onRejected={() => setSelectedIds(new Set())}
      />
      <UnrejectCandidateDialog
        candidate={unrejectTarget}
        onOpenChange={(o) => !o && setUnrejectTarget(null)}
        onUnrejected={() => setUnrejectTarget(null)}
      />
      <CancelInterviewDialog
        target={cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        onCancelled={() => setCancelTarget(null)}
      />
    </AppShell>
  );
}
