import { AppShell } from "@/components/app-shell";
import {
  CancelInterviewDialog,
  type CancelInterviewTarget,
} from "@/components/cancel-interview-dialog";
import { CandidatePicker } from "@/components/orchestrator/candidate-picker";
import { RoundStepper } from "@/components/orchestrator/round-stepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BUSINESS_HOURS_END,
  BUSINESS_HOURS_START,
  candidatesQuery,
  formatDate,
  formatTime,
  fullName,
  initials,
  interviewersQuery,
  interviewsQuery,
  isSlotBookable,
  isWeekday,
  jobLabel,
  logActivity,
  resolveRoundBookingState,
  resolveRoundProgression,
  SLOT_LEAD_BUFFER_MINUTES,
  STAGE_LABEL,
  type Round,
} from "@/lib/hiring";
import { findInterviewerConflict, findSchedulingConflicts } from "@/lib/scheduling-conflicts";
import { bookInterview, rescheduleInterview } from "@/lib/scheduling.functions";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BellRing,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/orchestrator")({
  validateSearch: (search: Record<string, unknown>) => ({
    candidateId:
      typeof search["candidateId"] === "string" ? (search["candidateId"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Interview Orchestrator — HireCopilot" },
      {
        name: "description",
        content:
          "AI finds the best slots, matches the interview panel, books it and sends reminders.",
      },
      { property: "og:title", content: "Interview Orchestrator — HireCopilot" },
      {
        property: "og:description",
        content: "AI-matched interview slots, panel selection and automated booking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrchestratorPage,
});

const STEPS = [
  "Choose Candidate & Round",
  "Find Slots",
  "Select Panel",
  "Confirm & Book",
  "Send Reminders",
];

type SlotOption = { id: string; start: Date; end: Date; score: number; best: boolean };

type InterviewerAvailability =
  | { state: "available" }
  | { state: "unavailable"; conflictStart: string; conflictEnd: string }
  | { state: "unknown" };

function nextWeekday(from: Date): Date {
  const date = new Date(from);
  while (!isWeekday(date)) date.setDate(date.getDate() + 1);
  return date;
}

function nextSlots(now: Date): SlotOption[] {
  const base = new Date(now);
  base.setDate(base.getDate() + 1);
  base.setMinutes(0, 0, 0);
  const firstDay = nextWeekday(base);
  const laterDay = nextWeekday(new Date(firstDay.getTime() + 86400000));
  const options = [
    { hour: 15, score: 95 },
    { hour: 16, score: 88 },
    { hour: 14, score: 85 },
    { hour: 10, score: 72, dayOffset: 1 },
  ];
  const candidates = options.map((o, i) => {
    const start = new Date(o.dayOffset ? laterDay : firstDay);
    start.setHours(o.hour, 0, 0, 0);
    const end = new Date(start.getTime() + 3600000);
    return { id: `slot-${i}`, start, end, score: o.score, best: false };
  });
  const bookable = candidates.filter((s) => isSlotBookable(s.start, now));
  const bestScore = Math.max(...bookable.map((s) => s.score), -Infinity);
  let bestAssigned = false;
  return bookable.map((s) => {
    const best = !bestAssigned && s.score === bestScore;
    if (best) bestAssigned = true;
    return { ...s, best };
  });
}

function suggestedTimesForDate(date: Date, now: Date): SlotOption[] {
  const hours = Array.from(
    { length: BUSINESS_HOURS_END - BUSINESS_HOURS_START },
    (_, i) => BUSINESS_HOURS_START + i,
  );
  const candidates = hours
    .map((hour, idx) => {
      const start = new Date(date);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + 3600000);
      const distanceFromIdeal = Math.abs(hour - 15);
      const score = Math.max(60, 95 - distanceFromIdeal * 6);
      return { id: `manual-slot-${idx}`, start, end, score, best: false };
    })
    .filter((c) => isSlotBookable(c.start, now));
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const bestId = sorted[0]?.id;
  return candidates.map((c) => ({ ...c, best: bestId === c.id }));
}

function OrchestratorPage() {
  const { candidateId } = Route.useSearch();
  const queryClient = useQueryClient();
  const bookInterviewFn = useServerFn(bookInterview);
  const rescheduleInterviewFn = useServerFn(rescheduleInterview);
  const candidates = useQuery(candidatesQuery);
  const interviewers = useQuery(interviewersQuery);
  const interviews = useQuery(interviewsQuery);

  // Stays null through SSR and first paint so slot times never render against the server clock.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);

  const startOfToday = useMemo(() => {
    if (!now) return undefined;
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date;
  }, [now]);

  const slots = useMemo(() => (now ? nextSlots(now) : []), [now]);
  const [step, setStep] = useState(0);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | undefined>(candidateId);
  const selectedCandidateIdRef = useRef(selectedCandidateId);
  selectedCandidateIdRef.current = selectedCandidateId;
  const [slotId, setSlotId] = useState(slots[0]?.id ?? "");
  const [panel, setPanel] = useState<string[]>([]);
  const [selectedRound, setSelectedRound] = useState<Round | undefined>(undefined);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [remindersSent, setRemindersSent] = useState(false);
  const [manualExpanded, setManualExpanded] = useState(false);
  const [manualDate, setManualDate] = useState<Date | undefined>(undefined);
  const [manualTime, setManualTime] = useState<string>(""); // "HH:mm"
  const [manualSuggestedSlotId, setManualSuggestedSlotId] = useState<string | undefined>(undefined);
  const [cancelTarget, setCancelTarget] = useState<CancelInterviewTarget | null>(null);

  const list = candidates.data ?? [];
  const selectableCandidates = list.filter(
    (c) => c.current_stage !== "REJECTED" && c.current_stage !== "OFFER",
  );
  const hiddenExcludedCount = list.length - selectableCandidates.length;
  const selectedCandidate = list.find((c) => c.id === selectedCandidateId);
  const selectedCandidateRejected = selectedCandidate?.current_stage === "REJECTED";
  const selectedCandidateOffered = selectedCandidate?.current_stage === "OFFER";
  const candidate =
    selectedCandidateRejected || selectedCandidateOffered
      ? undefined
      : selectableCandidates.find((c) => c.id === selectedCandidateId);
  const rejectedCandidateMessage = selectedCandidateRejected
    ? `${fullName(selectedCandidate)} must be restored to the pipeline before booking an interview.`
    : null;
  const offeredCandidateMessage = selectedCandidateOffered
    ? `${fullName(selectedCandidate)} already has an offer. Scheduling is now handled by onboarding.`
    : null;
  const blockedCandidateMessage = rejectedCandidateMessage ?? offeredCandidateMessage;

  const interviewsLoaded = interviews.isSuccess;

  // Stay null until interviews resolve so the round floor is never derived from current_stage alone.
  const progression = useMemo(
    () =>
      candidate && interviewsLoaded
        ? resolveRoundProgression(candidate, interviews.data ?? [])
        : null,
    [candidate, interviews.data, interviewsLoaded],
  );
  const activeRound = selectedRound ?? progression?.defaultRound;

  useEffect(() => {
    if (!candidate || !interviewsLoaded) return;
    setSelectedRound((prev) => prev ?? progression?.defaultRound);
    // Only re-apply the default when the candidate changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id, interviewsLoaded]);

  const bookingState = useMemo(
    () =>
      candidate && activeRound
        ? resolveRoundBookingState(candidate, interviews.data ?? [], activeRound)
        : null,
    [candidate, interviews.data, activeRound],
  );

  const ignoreBookingGroupId =
    bookingState?.mode === "RESCHEDULE" ? bookingState.activeBooking?.booking_group_id : undefined;

  const step1Complete =
    !!candidate &&
    !!activeRound &&
    !selectedCandidateRejected &&
    !selectedCandidateOffered &&
    interviewsLoaded;
  const slot: SlotOption | undefined = slots.find((s) => s.id === slotId) ?? slots[0];

  useEffect(() => {
    setSlotId((prev) => (slots.some((s) => s.id === prev) ? prev : (slots[0]?.id ?? "")));
  }, [slots]);

  const manualMode: "A" | "B" | "C" = !manualExpanded || !manualDate ? "A" : manualTime ? "C" : "B";

  const manualSuggestedTimes = useMemo(
    () =>
      manualMode === "B" && manualDate && now && isWeekday(manualDate)
        ? suggestedTimesForDate(manualDate, now)
        : [],
    [manualMode, manualDate, now],
  );

  const effectiveSlot = useMemo<SlotOption | undefined>(() => {
    if (manualMode === "C" && manualDate && manualTime) {
      const match = /^(\d{1,2}):(\d{2})$/.exec(manualTime);
      const rawHours = match?.[1];
      const rawMinutes = match?.[2];
      if (rawHours === undefined || rawMinutes === undefined) return undefined;
      const hours = Number(rawHours);
      const minutes = Number(rawMinutes);
      if (hours > 23 || minutes > 59) return undefined;
      const start = new Date(manualDate);
      start.setHours(hours, minutes, 0, 0);
      const end = new Date(start.getTime() + 3600000);
      return { id: "manual-exact", start, end, score: 100, best: false };
    }
    // Once a manual date is committed, never fall back to an AI slot on a different day.
    if (manualMode === "B") {
      return (
        manualSuggestedTimes.find((s) => s.id === manualSuggestedSlotId) ??
        manualSuggestedTimes.find((s) => s.best)
      );
    }
    return slot;
  }, [manualMode, manualDate, manualTime, manualSuggestedTimes, manualSuggestedSlotId, slot]);

  const manualTimeError = useMemo<string | null>(() => {
    if (manualMode !== "C" || !manualDate || !manualTime) return null;
    if (!effectiveSlot) return "Enter a valid time.";
    if (now && !isSlotBookable(effectiveSlot.start, now)) {
      return `Pick a time at least ${SLOT_LEAD_BUFFER_MINUTES} minutes from now.`;
    }
    return null;
  }, [manualMode, manualDate, manualTime, effectiveSlot, now]);

  const outsideBusinessHours =
    manualMode === "C" &&
    !manualTimeError &&
    !!effectiveSlot &&
    (effectiveSlot.start.getHours() < BUSINESS_HOURS_START ||
      effectiveSlot.start.getHours() >= BUSINESS_HOURS_END);

  function resetWizard() {
    setSelectedRound(undefined);
    setSlotId(slots[0]?.id ?? "");
    setPanel([]);
    setBooked(false);
    setRemindersSent(false);
    setStep(0);
    setManualExpanded(false);
    setManualDate(undefined);
    setManualTime("");
    setManualSuggestedSlotId(undefined);
  }

  function handleCandidateChange(id: string) {
    setSelectedCandidateId(id);
    resetWizard();
  }

  function clearCandidate() {
    setSelectedCandidateId(undefined);
    resetWizard();
  }

  function handleRoundChange(round: Round) {
    setSelectedRound(round);
    setSlotId(slots[0]?.id ?? "");
    setPanel([]);
    setBooked(false);
    setRemindersSent(false);
    setManualExpanded(false);
    setManualDate(undefined);
    setManualTime("");
    setManualSuggestedSlotId(undefined);
  }

  // "Available" here means no overlapping booking only; slot-level rules (past, weekday,
  // business hours) are enforced where the slot itself is chosen.
  const availabilityByInterviewer = useMemo<Record<string, InterviewerAvailability>>(() => {
    const entries = interviewers.data ?? [];
    if (!interviewsLoaded || !effectiveSlot) {
      return Object.fromEntries(entries.map((i) => [i.id, { state: "unknown" } as const]));
    }
    const startIso = effectiveSlot.start.toISOString();
    const endIso = effectiveSlot.end.toISOString();
    return Object.fromEntries(
      entries.map((i) => {
        const conflict = findInterviewerConflict(
          i.id,
          startIso,
          endIso,
          interviews.data ?? [],
          ignoreBookingGroupId,
        );
        return [
          i.id,
          conflict
            ? ({
                state: "unavailable",
                conflictStart: conflict.start,
                conflictEnd: conflict.end,
              } as const)
            : ({ state: "available" } as const),
        ];
      }),
    );
  }, [interviewers.data, interviews.data, interviewsLoaded, effectiveSlot, ignoreBookingGroupId]);

  const ranked = useMemo(() => {
    const required = candidate?.jobs ? (candidate.skills ?? []) : [];
    const rankingDate = manualMode !== "A" ? manualDate : undefined;
    return (interviewers.data ?? [])
      .map((i) => {
        const overlap = i.skills.filter((s) => required.includes(s)).length;
        const load = (interviews.data ?? []).filter((iv) => {
          if (iv.interviewer_id !== i.id || iv.status !== "SCHEDULED") return false;
          if (!rankingDate) return true;
          const ivDate = new Date(iv.scheduled_start);
          return (
            ivDate.getFullYear() === rankingDate.getFullYear() &&
            ivDate.getMonth() === rankingDate.getMonth() &&
            ivDate.getDate() === rankingDate.getDate()
          );
        }).length;
        const score = Math.min(98, 62 + overlap * 12 - load * 4);
        const availability: InterviewerAvailability = availabilityByInterviewer[i.id] ?? {
          state: "unknown",
        };
        return { ...i, overlap, load, score, availability };
      })
      .sort((a, b) => {
        const aBusy = a.availability.state === "unavailable";
        const bBusy = b.availability.state === "unavailable";
        if (aBusy !== bBusy) return aBusy ? 1 : -1;
        return b.score - a.score;
      });
  }, [
    interviewers.data,
    interviews.data,
    candidate,
    manualMode,
    manualDate,
    availabilityByInterviewer,
  ]);

  const interviewerLabels = useMemo(
    () => Object.fromEntries(ranked.map((r) => [r.id, r.name])),
    [ranked],
  );
  const interviewerLabelsRef = useRef(interviewerLabels);
  interviewerLabelsRef.current = interviewerLabels;

  const bestPanel = ranked
    .filter((r) => r.availability.state === "available")
    .slice(0, 1)
    .map((r) => r.id);
  const chosenPanel = panel.length ? panel : bestPanel;
  const panelTimezones = [
    ...new Set(
      ranked
        .filter((r) => chosenPanel.includes(r.id))
        .map((r) => r.timezone)
        .filter(Boolean),
    ),
  ].join(", ");

  useEffect(() => {
    if (!panel.length) return;
    const removed = panel.filter((id) => availabilityByInterviewer[id]?.state === "unavailable");
    if (!removed.length) return;
    const names = removed.map((id) => interviewerLabelsRef.current[id] ?? "Interviewer");
    setPanel((prev) => prev.filter((id) => !removed.includes(id)));
    toast.warning(
      `Removed from the panel — busy at this time: ${names.join(", ")}. Pick another slot or another interviewer.`,
    );
  }, [availabilityByInterviewer, panel]);

  const schedulingConflicts = useMemo(() => {
    if (!candidate || !effectiveSlot) return [];
    return findSchedulingConflicts(
      candidate.id,
      fullName(candidate),
      chosenPanel,
      interviewerLabels,
      effectiveSlot.start,
      effectiveSlot.end,
      interviews.data ?? [],
      { ignoreBookingGroupId },
    );
  }, [
    candidate,
    chosenPanel,
    interviewerLabels,
    effectiveSlot,
    interviews.data,
    ignoreBookingGroupId,
  ]);

  const busyPanelMembers = chosenPanel.filter(
    (id) => availabilityByInterviewer[id]?.state === "unavailable",
  );
  const topAvailableInterviewer = ranked.find((r) => r.availability.state === "available");
  const confirmBlockedReason = !step1Complete
    ? null
    : !effectiveSlot
      ? manualMode === "B"
        ? "Pick a time for the selected date to continue."
        : "Pick a date and time to continue."
      : manualTimeError
        ? manualTimeError
        : !chosenPanel.length
          ? "No interviewer is free for this slot — choose another time."
          : busyPanelMembers.length
            ? "A selected interviewer is busy at this time."
            : chosenPanel.some((id) => availabilityByInterviewer[id]?.state !== "available")
              ? "Checking interviewer calendars…"
              : null;

  async function confirmBooking() {
    if (!candidate || !activeRound) {
      toast.error(blockedCandidateMessage ?? "Select an active candidate before booking.");
      return;
    }
    if (!effectiveSlot) {
      toast.error("Pick a date and time before booking.");
      return;
    }
    const payload = {
      candidateId: candidate.id,
      jobId: candidate.job_id,
      stage: activeRound,
      scheduledStart: effectiveSlot.start.toISOString(),
      scheduledEnd: effectiveSlot.end.toISOString(),
      interviewerIds: chosenPanel,
    };
    const reschedulingGroupId = ignoreBookingGroupId;

    const bookingForCandidateId = candidate.id;
    setBooking(true);
    try {
      const result = reschedulingGroupId
        ? await rescheduleInterviewFn({
            data: { ...payload, previousBookingGroupId: reschedulingGroupId },
          })
        : await bookInterviewFn({ data: payload });

      // The selection may have been cleared or changed mid-flight; discard the stale result.
      if (selectedCandidateIdRef.current !== bookingForCandidateId) return;

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      await queryClient.invalidateQueries();
      setBooked(true);
      setStep(4);
      toast.success(
        reschedulingGroupId
          ? `Interview rescheduled for ${fullName(candidate)}`
          : `Interview booked for ${fullName(candidate)}`,
      );
    } catch (error: unknown) {
      if (selectedCandidateIdRef.current !== bookingForCandidateId) return;
      toast.error(error instanceof Error ? error.message : "Could not book the interview");
    } finally {
      setBooking(false);
    }
  }

  async function sendReminders() {
    if (!candidate || !activeRound) return;
    await logActivity(candidate.id, "REMINDERS_SENT", {
      channels: ["Microsoft Teams", "Email"],
      round: activeRound,
    });
    await queryClient.invalidateQueries();
    setRemindersSent(true);
    toast.success("Calendar invites and reminders sent to the candidate and panel");
  }

  return (
    <AppShell
      title="Interview Orchestrator"
      subtitle="AI finds the best slots, books the panel and sends reminders automatically."
    >
      <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2">
        {STEPS.map((label, i) => {
          const stepDisabled = i > 0 && !step1Complete;
          return (
            <div key={label} className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => setStep(i)}
                disabled={stepDisabled}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                  stepDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-xs",
                    i === step ? "bg-white/20" : "bg-muted",
                  )}
                >
                  {i + 1}
                </span>
                {label}
              </button>
              {i < STEPS.length - 1 && <div className="hidden h-px w-10 bg-border sm:block" />}
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card className="gap-0 p-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 font-display text-lg font-semibold text-primary">
                {candidate ? initials(fullName(candidate)) : "--"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg font-semibold">
                    {candidate ? fullName(candidate) : "Select a candidate"}
                  </p>
                  {activeRound && (
                    <Badge variant="secondary">{STAGE_LABEL[activeRound]} Round</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {candidate?.jobs ? jobLabel(candidate.jobs) : "—"} · Experience:{" "}
                  {candidate?.experience_years ?? 0} years · <MapPin className="inline size-3" />{" "}
                  {candidate?.jobs?.location ?? "India"}
                </p>
              </div>
            </div>
            {blockedCandidateMessage ? (
              <div className="mt-4 space-y-3">
                <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {blockedCandidateMessage}
                </p>
                <Button variant="outline" size="sm" onClick={clearCandidate} disabled={booking}>
                  Choose another candidate
                </Button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {candidate ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{fullName(candidate)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {candidate.jobs ? jobLabel(candidate.jobs) : "—"} ·{" "}
                        {STAGE_LABEL[candidate.current_stage]}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={clearCandidate} disabled={booking}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <CandidatePicker
                    candidates={selectableCandidates}
                    loading={candidates.isLoading}
                    hiddenExcludedCount={hiddenExcludedCount}
                    selectedId={selectedCandidateId}
                    autoFocus={!selectedCandidateId}
                    onSelect={handleCandidateChange}
                  />
                )}

                {candidate && !interviewsLoaded && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">Interview round</p>
                      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Checking this candidate&apos;s interview history…
                    </p>
                  </div>
                )}

                {candidate && progression && activeRound && (
                  <RoundStepper
                    progression={progression}
                    value={activeRound}
                    loading={interviews.isFetching}
                    onChange={handleRoundChange}
                  />
                )}

                {activeRound && bookingState?.isRepeatOfCompletedRound && (
                  <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                    This candidate already has a completed {STAGE_LABEL[activeRound]} round. Booking
                    again adds another {STAGE_LABEL[activeRound]}.
                  </p>
                )}

                {bookingState?.activeBooking && (
                  <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">Currently scheduled</p>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          candidate &&
                          bookingState.activeBooking &&
                          setCancelTarget({
                            bookingGroupId: bookingState.activeBooking.booking_group_id,
                            candidateId: candidate.id,
                            candidateName: fullName(candidate),
                            stage: bookingState.activeBooking.stage,
                            scheduledStart: bookingState.activeBooking.scheduled_start,
                          })
                        }
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {formatDate(bookingState.activeBooking.scheduled_start)},{" "}
                      {formatTime(bookingState.activeBooking.scheduled_start)} –{" "}
                      {formatTime(bookingState.activeBooking.scheduled_end)}
                    </p>
                    <p className="text-muted-foreground">
                      {bookingState.activeBooking.interviewer_names.join(", ") || "—"}
                    </p>
                    {bookingState.activeBooking.interviews[0]?.meeting_link && (
                      <a
                        href={bookingState.activeBooking.interviews[0].meeting_link}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Video className="size-3" /> Join link
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
            <Card className="gap-0 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">AI Recommended Slots</p>
                <Badge variant="outline">Best match</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {!now ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Loading slots…
                  </div>
                ) : slots.length === 0 ? (
                  <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    No upcoming AI slots — pick a date and time manually.
                  </p>
                ) : (
                  slots.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSlotId(s.id);
                        setManualExpanded(false);
                        setManualDate(undefined);
                        setManualTime("");
                        setManualSuggestedSlotId(undefined);
                      }}
                      disabled={!step1Complete}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition-colors",
                        manualMode === "A" && s.id === slotId
                          ? "border-success/50 bg-success/5"
                          : "border-border hover:bg-muted/50",
                        !step1Complete && "cursor-not-allowed opacity-60 hover:bg-transparent",
                      )}
                    >
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {s.start.toLocaleDateString([], {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                        <span>{s.best ? "Best match" : `Score: ${s.score}%`}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {formatTime(s.start.toISOString())} – {formatTime(s.end.toISOString())}
                        </span>
                        {manualMode === "A" && s.id === slotId && (
                          <CheckCircle2 className="size-4 text-success" />
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
              {!step1Complete && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Choose a candidate and round to continue
                </p>
              )}
              <Separator className="my-3" />
              {!manualExpanded ? (
                <button
                  onClick={() => setManualExpanded(true)}
                  disabled={!step1Complete}
                  className={cn(
                    "text-xs font-medium text-primary hover:underline",
                    !step1Complete && "cursor-not-allowed text-muted-foreground opacity-60",
                  )}
                >
                  Pick date &amp; time manually
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold">Manual date &amp; time</p>
                    <button
                      onClick={() => {
                        setManualExpanded(false);
                        setManualDate(undefined);
                        setManualTime("");
                        setManualSuggestedSlotId(undefined);
                      }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Use AI suggestion instead
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          {manualDate
                            ? manualDate.toLocaleDateString([], {
                                weekday: "short",
                                day: "2-digit",
                                month: "short",
                              })
                            : "Choose date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={manualDate}
                          disabled={startOfToday ? { before: startOfToday } : undefined}
                          onSelect={(date) => {
                            setManualDate(date);
                            setManualTime("");
                            setManualSuggestedSlotId(undefined);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="time"
                      value={manualTime}
                      disabled={!manualDate}
                      aria-invalid={!!manualTimeError}
                      onChange={(e) => setManualTime(e.target.value)}
                      className="w-32"
                    />
                  </div>
                  {manualTimeError && <p className="text-xs text-destructive">{manualTimeError}</p>}
                  {outsideBusinessHours && (
                    <p className="text-xs text-muted-foreground">Outside business hours</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Leave the time blank to pick from AI-suggested times for that day.
                  </p>
                  {manualMode === "B" &&
                    manualDate &&
                    (!isWeekday(manualDate) ? (
                      <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                        AI doesn&apos;t suggest times on weekends — pick a time manually above.
                      </p>
                    ) : manualSuggestedTimes.length === 0 ? (
                      <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                        No remaining slots today — pick a later date or enter a time manually.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {manualSuggestedTimes.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setManualSuggestedSlotId(s.id)}
                            className={cn(
                              "w-full rounded-lg border p-3 text-left transition-colors",
                              s.id === effectiveSlot?.id
                                ? "border-success/50 bg-success/5"
                                : "border-border hover:bg-muted/50",
                            )}
                          >
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{s.best ? "Best match" : `Score: ${s.score}%`}</span>
                            </div>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {formatTime(s.start.toISOString())} –{" "}
                                {formatTime(s.end.toISOString())}
                              </span>
                              {s.id === effectiveSlot?.id && (
                                <CheckCircle2 className="size-4 text-success" />
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                  {manualMode === "C" && effectiveSlot && !manualTimeError && (
                    <p className="rounded-lg border border-success/40 bg-success/5 p-3 text-xs">
                      Booking for{" "}
                      {effectiveSlot.start.toLocaleDateString([], {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                      })}
                      , {formatTime(effectiveSlot.start.toISOString())} –{" "}
                      {formatTime(effectiveSlot.end.toISOString())}.
                    </p>
                  )}
                </div>
              )}
              {schedulingConflicts.length > 0 && (
                <div className="mt-3 space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
                  <p className="font-semibold">Possible scheduling conflicts</p>
                  {schedulingConflicts.map((c, idx) => (
                    <p key={`${c.who}-${idx}`}>
                      {c.who}: {formatTime(c.start)} – {formatTime(c.end)}
                    </p>
                  ))}
                </div>
              )}
            </Card>

            <Card className="gap-0 p-4">
              <TooltipProvider>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Select Interview Panel</p>
                  <Badge variant="outline">Sorted by availability &amp; AI score</Badge>
                </div>
                {!interviewsLoaded ? (
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Checking interviewer calendars…
                  </div>
                ) : ranked.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No interviewers configured yet.{" "}
                    <Link to="/configuration" className="font-medium text-primary hover:underline">
                      Add interviewers
                    </Link>{" "}
                    to build a panel.
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-border overflow-x-auto">
                    {ranked.map((i) => {
                      const checked = chosenPanel.includes(i.id);
                      const unavailable = i.availability.state === "unavailable";
                      const isBestMatch = bestPanel[0] === i.id;
                      const busyLabel =
                        i.availability.state === "unavailable"
                          ? `Busy · ${formatTime(i.availability.conflictStart)} – ${formatTime(i.availability.conflictEnd)}`
                          : null;
                      const row = (
                        <label
                          className={cn(
                            "flex min-w-[560px] items-center gap-3 py-3 sm:min-w-0",
                            step1Complete && !unavailable
                              ? "cursor-pointer"
                              : "cursor-not-allowed opacity-60",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={!step1Complete || unavailable}
                            aria-label={`${i.name}${busyLabel ? ` — ${busyLabel}` : ""}`}
                            onCheckedChange={(value) =>
                              setPanel((prev) => {
                                const base = prev.length ? prev : bestPanel;
                                return value
                                  ? [...new Set([...base, i.id])]
                                  : base.filter((p) => p !== i.id);
                              })
                            }
                          />
                          <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                            {initials(i.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{i.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{i.title}</p>
                            {busyLabel && (
                              <p className="text-xs text-muted-foreground sm:hidden">{busyLabel}</p>
                            )}
                          </div>
                          <div className="hidden text-xs text-muted-foreground sm:block">
                            {i.availability.state === "unavailable" ? (
                              <p>{busyLabel}</p>
                            ) : i.availability.state === "available" ? (
                              <>
                                <p>Free</p>
                                <p>
                                  {effectiveSlot
                                    ? formatTime(effectiveSlot.start.toISOString())
                                    : "—"}
                                </p>
                              </>
                            ) : (
                              <p>Checking…</p>
                            )}
                          </div>
                          <div className="text-xs">
                            <p className="text-muted-foreground">AI score</p>
                            <p
                              className={cn(
                                "font-semibold",
                                i.score >= 85 ? "text-success" : "text-warning-foreground",
                              )}
                            >
                              {i.score}%
                            </p>
                          </div>
                          <div className="text-xs">
                            <p className="text-muted-foreground">Load</p>
                            <p className="font-semibold">{i.load}/5</p>
                          </div>
                          {isBestMatch && <Badge variant="secondary">Best match</Badge>}
                        </label>
                      );
                      if (!unavailable) return <div key={i.id}>{row}</div>;
                      return (
                        <Tooltip key={i.id}>
                          <TooltipTrigger asChild>
                            <div tabIndex={0}>{row}</div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {i.name} already has an interview from{" "}
                            {busyLabel?.replace("Busy · ", "")}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}
                {interviewsLoaded && ranked.length > 0 && bestPanel.length === 0 && (
                  <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
                    No interviewer is free for this slot — choose another time.
                  </p>
                )}
                {!step1Complete && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Choose a candidate and round to continue
                  </p>
                )}
              </TooltipProvider>
            </Card>
          </div>

          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap items-center gap-6 text-xs text-muted-foreground">
              {[
                { icon: CalendarClock, label: "Check calendars" },
                { icon: CheckCircle2, label: "Book the slot" },
                { icon: CalendarCheck, label: "Send calendar invites" },
                { icon: BellRing, label: "Send reminders" },
                { icon: Clock, label: "Follow up" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <s.icon
                    className={cn("size-4", booked ? "text-success" : "text-muted-foreground")}
                  />
                  {s.label}
                </div>
              ))}
              {!step1Complete && (
                <p className="basis-full text-xs text-muted-foreground">
                  Choose a candidate and round to continue
                </p>
              )}
            </div>
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={confirmBooking}
                  disabled={booking || !step1Complete || booked || !!confirmBlockedReason}
                >
                  {booking && <Loader2 className="mr-2 size-4 animate-spin" />}{" "}
                  {booked
                    ? "Booked"
                    : bookingState?.mode === "RESCHEDULE"
                      ? "Confirm & reschedule"
                      : "Confirm & schedule"}
                </Button>
                <Button
                  variant="outline"
                  onClick={sendReminders}
                  disabled={!step1Complete || !booked || remindersSent}
                >
                  <BellRing className="mr-2 size-4" />{" "}
                  {remindersSent ? "Reminders sent" : "Send reminders"}
                </Button>
              </div>
              {!booked && confirmBlockedReason && (
                <p className="text-xs text-muted-foreground">{confirmBlockedReason}</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="gap-0 p-5">
            <p className="font-display text-base font-semibold">Interview Summary</p>
            <div className="mt-4 space-y-3 text-sm">
              {[
                ["Candidate", step1Complete && candidate ? fullName(candidate) : "—"],
                ["Round", step1Complete && activeRound ? `${STAGE_LABEL[activeRound]} Round` : "—"],
                [
                  "Date & time",
                  step1Complete && effectiveSlot
                    ? `${effectiveSlot.start.toLocaleDateString([], { day: "2-digit", month: "short" })}, ${formatTime(effectiveSlot.start.toISOString())} – ${formatTime(effectiveSlot.end.toISOString())}`
                    : "—",
                ],
                ["Duration", step1Complete ? "60 minutes" : "—"],
                ["Mode", step1Complete ? "Microsoft Teams" : "—"],
                [
                  "Interviewers",
                  (step1Complete &&
                    ranked
                      .filter((r) => chosenPanel.includes(r.id))
                      .map((r) => r.name)
                      .join(", ")) ||
                    "—",
                ],
                ["Time zone", (step1Complete && panelTimezones) || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="min-w-0 break-words text-right font-medium">{value}</span>
                </div>
              ))}
            </div>
            {bookingState?.activeBooking && (
              <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">Currently scheduled</p>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      candidate &&
                      bookingState.activeBooking &&
                      setCancelTarget({
                        bookingGroupId: bookingState.activeBooking.booking_group_id,
                        candidateId: candidate.id,
                        candidateName: fullName(candidate),
                        stage: bookingState.activeBooking.stage,
                        scheduledStart: bookingState.activeBooking.scheduled_start,
                      })
                    }
                  >
                    Cancel
                  </Button>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {formatDate(bookingState.activeBooking.scheduled_start)},{" "}
                  {formatTime(bookingState.activeBooking.scheduled_start)} –{" "}
                  {formatTime(bookingState.activeBooking.scheduled_end)}
                </p>
                <p className="text-muted-foreground">
                  {bookingState.activeBooking.interviewer_names.join(", ") || "—"}
                </p>
              </div>
            )}
            <Separator className="my-4" />
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" /> AI Assistant
            </p>
            <p className="mt-2 rounded-lg bg-accent/50 p-3 text-sm text-muted-foreground">
              {schedulingConflicts.length > 0
                ? "This slot clashes with an existing booking — pick another time for a clean run."
                : "This slot has the highest panel availability and the best overlap with the candidate's preferred window."}{" "}
              Probability of successful scheduling is{" "}
              <span className="font-semibold text-primary">{effectiveSlot?.score ?? 0}%</span>.
            </p>
            <p className="mt-4 text-sm font-semibold">Smart suggestions</p>
            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
              {[
                `${topAvailableInterviewer?.name ?? "No interviewer is free for this slot"}${topAvailableInterviewer ? " is the best match for this round" : ""}`,
                schedulingConflicts.length > 0
                  ? "Resolve the listed conflicts before booking"
                  : "This slot has minimum rescheduling risk",
                "Candidate stage and panel skills are aligned",
              ].map((s) => (
                <li key={s} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 text-success" /> {s}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="gap-0 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4" /> Scheduling impact
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Recruiter hours saved</p>
                <p className="font-display text-xl font-semibold">3.5h</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Time to schedule</p>
                <p className="font-display text-xl font-semibold">12s</p>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Video className="size-3" /> Teams link is generated automatically on booking.
            </p>
          </Card>
        </div>
      </div>

      <CancelInterviewDialog
        target={cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        onCancelled={() => setCancelTarget(null)}
      />
    </AppShell>
  );
}
