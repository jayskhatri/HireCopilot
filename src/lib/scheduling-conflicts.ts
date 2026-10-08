import type { Interview } from "@/lib/hiring";

export type SchedulingConflict = { who: string; start: string; end: string };

export type ConflictInterview = Pick<
  Interview,
  | "candidate_id"
  | "interviewer_id"
  | "status"
  | "scheduled_start"
  | "scheduled_end"
  | "booking_group_id"
>;

// Half-open [start, end) overlap, matching the server's tstzrange. Compared as epoch
// milliseconds because Supabase returns "+00:00" offsets while callers pass ".000Z",
// which do not sort consistently as strings.
export function interviewOverlaps(
  interview: Pick<Interview, "status" | "scheduled_start" | "scheduled_end">,
  startIso: string,
  endIso: string,
): boolean {
  if (interview.status !== "SCHEDULED") return false;
  const windowStart = Date.parse(startIso);
  const windowEnd = Date.parse(endIso);
  const interviewStart = Date.parse(interview.scheduled_start);
  const interviewEnd = Date.parse(interview.scheduled_end);
  if (
    Number.isNaN(windowStart) ||
    Number.isNaN(windowEnd) ||
    Number.isNaN(interviewStart) ||
    Number.isNaN(interviewEnd)
  ) {
    return false;
  }
  return interviewStart < windowEnd && interviewEnd > windowStart;
}

export function findInterviewerConflict(
  interviewerId: string,
  startIso: string,
  endIso: string,
  interviews: ConflictInterview[],
  ignoreBookingGroupId?: string,
): { start: string; end: string } | null {
  for (const iv of interviews) {
    if (iv.interviewer_id !== interviewerId) continue;
    if (ignoreBookingGroupId && iv.booking_group_id === ignoreBookingGroupId) continue;
    if (interviewOverlaps(iv, startIso, endIso)) {
      return { start: iv.scheduled_start, end: iv.scheduled_end };
    }
  }
  return null;
}

export function findSchedulingConflicts(
  candidateId: string,
  candidateLabel: string,
  interviewerIds: string[],
  interviewerLabels: Record<string, string>,
  start: Date,
  end: Date,
  interviews: ConflictInterview[],
  options?: { ignoreBookingGroupId?: string | undefined },
): SchedulingConflict[] {
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const ignoreBookingGroupId = options?.ignoreBookingGroupId;

  const conflicts: SchedulingConflict[] = [];
  for (const iv of interviews) {
    if (ignoreBookingGroupId && iv.booking_group_id === ignoreBookingGroupId) continue;
    if (!interviewOverlaps(iv, startIso, endIso)) continue;
    // One line per conflicting interview, even when it clashes with both the candidate and a panel member.
    const who: string[] = [];
    if (iv.candidate_id === candidateId) who.push(candidateLabel);
    if (iv.interviewer_id && interviewerIds.includes(iv.interviewer_id)) {
      who.push(interviewerLabels[iv.interviewer_id] ?? "Interviewer");
    }
    if (!who.length) continue;
    conflicts.push({
      who: who.join(" & "),
      start: iv.scheduled_start,
      end: iv.scheduled_end,
    });
  }
  return conflicts;
}
