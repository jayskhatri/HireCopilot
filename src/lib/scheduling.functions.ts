import { createServerFn } from "@tanstack/react-start";

export type BookInterviewInput = {
  candidateId: string;
  jobId: string | null;
  stage: string;
  scheduledStart: string;
  scheduledEnd: string;
  interviewerIds: string[];
};

export type BookInterviewResult =
  { ok: true; bookingGroupId: string } | { ok: false; reason: string; message: string };

type SupabaseAdmin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

type BookingFailure = { ok: false; reason: string; message: string };

async function validateBooking(
  admin: SupabaseAdmin,
  data: BookInterviewInput,
  opts: { ignoreBookingGroupId?: string } = {},
): Promise<{ ok: true; priorStage: string } | BookingFailure> {
  if (!data.interviewerIds.length) {
    return {
      ok: false,
      reason: "NO_PANEL",
      message: "Select at least one interviewer before booking.",
    };
  }

  if (new Date(data.scheduledStart).getTime() < Date.now()) {
    return {
      ok: false,
      reason: "PAST_DATE",
      message: "That slot is in the past. Pick an upcoming time.",
    };
  }

  const { data: candidate, error: candidateError } = await admin
    .from("candidates")
    .select("id, current_stage")
    .eq("id", data.candidateId)
    .maybeSingle();
  if (candidateError) throw candidateError;
  if (!candidate) {
    return {
      ok: false,
      reason: "CANDIDATE_NOT_FOUND",
      message: "This candidate could not be found. Refresh and try again.",
    };
  }
  if (candidate.current_stage === "REJECTED") {
    return {
      ok: false,
      reason: "CANDIDATE_REJECTED",
      message: "Restore this candidate to the pipeline before booking an interview.",
    };
  }

  let candidateConflictQuery = admin
    .from("interviews")
    .select("id")
    .eq("candidate_id", data.candidateId)
    .eq("status", "SCHEDULED")
    .lt("scheduled_start", data.scheduledEnd)
    .gt("scheduled_end", data.scheduledStart);
  if (opts.ignoreBookingGroupId) {
    candidateConflictQuery = candidateConflictQuery.neq(
      "booking_group_id",
      opts.ignoreBookingGroupId,
    );
  }
  const { data: candidateConflicts, error: candidateConflictError } = await candidateConflictQuery;
  if (candidateConflictError) throw candidateConflictError;
  if (candidateConflicts?.length) {
    return {
      ok: false,
      reason: "CANDIDATE_CONFLICT",
      message: "This candidate already has a scheduled interview that overlaps this time.",
    };
  }

  if (data.interviewerIds.length) {
    let interviewerConflictQuery = admin
      .from("interviews")
      .select("id")
      .in("interviewer_id", data.interviewerIds)
      .eq("status", "SCHEDULED")
      .lt("scheduled_start", data.scheduledEnd)
      .gt("scheduled_end", data.scheduledStart);
    if (opts.ignoreBookingGroupId) {
      interviewerConflictQuery = interviewerConflictQuery.neq(
        "booking_group_id",
        opts.ignoreBookingGroupId,
      );
    }
    const { data: interviewerConflicts, error: interviewerConflictError } =
      await interviewerConflictQuery;
    if (interviewerConflictError) throw interviewerConflictError;
    if (interviewerConflicts?.length) {
      return {
        ok: false,
        reason: "INTERVIEWER_CONFLICT",
        message: "One of the selected interviewers is already booked during this time.",
      };
    }
  }

  return { ok: true, priorStage: candidate.current_stage };
}

async function insertBookingGroup(
  admin: SupabaseAdmin,
  data: BookInterviewInput,
): Promise<{ ok: true; bookingGroupId: string } | BookingFailure> {
  const bookingGroupId = crypto.randomUUID();
  const rows = data.interviewerIds.map((interviewerId) => ({
    candidate_id: data.candidateId,
    job_id: data.jobId,
    interviewer_id: interviewerId,
    stage: data.stage,
    scheduled_start: data.scheduledStart,
    scheduled_end: data.scheduledEnd,
    booking_group_id: bookingGroupId,
    meeting_link: `https://teams.microsoft.com/l/meetup-join/hirecopilot/${data.candidateId.slice(0, 8)}-${data.stage.toLowerCase()}-${bookingGroupId.slice(0, 8)}`,
    status: "SCHEDULED",
  }));

  const { error: insertError } = await admin.from("interviews").insert(rows);
  if (insertError) {
    if (insertError.code === "23P01") {
      return {
        ok: false,
        reason: "RACE_CONDITION",
        message: "This slot was just booked by someone else. Pick another time.",
      };
    }
    if (insertError.code === "23514") {
      return {
        ok: false,
        reason: "INVALID_RANGE",
        message: "This booking violates a scheduling rule (invalid time range).",
      };
    }
    return { ok: false, reason: "UNKNOWN", message: insertError.message };
  }

  return { ok: true, bookingGroupId };
}

export const bookInterview = createServerFn({ method: "POST" })
  .inputValidator((data: BookInterviewInput) => data)
  .handler(async ({ data }): Promise<BookInterviewResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const validation = await validateBooking(supabaseAdmin, data);
    if (!validation.ok) return validation;

    const inserted = await insertBookingGroup(supabaseAdmin, data);
    if (!inserted.ok) return inserted;

    const { error: candidateUpdateError } = await supabaseAdmin
      .from("candidates")
      .update({ current_stage: data.stage, status_updated_at: new Date().toISOString() })
      .eq("id", data.candidateId);
    if (candidateUpdateError) throw candidateUpdateError;

    const activities = [
      {
        candidate_id: data.candidateId,
        action_type: "INTERVIEW_SCHEDULED",
        details: {
          stage: data.stage,
          scheduled_start: data.scheduledStart,
          interviewer_ids: data.interviewerIds,
          booking_group_id: inserted.bookingGroupId,
          booked_by: "AI Orchestrator",
        },
      },
      ...(validation.priorStage === data.stage
        ? []
        : [
            {
              candidate_id: data.candidateId,
              action_type: "STAGE_CHANGED",
              details: { from: validation.priorStage, to: data.stage },
            },
          ]),
    ];
    const { error: activityError } = await supabaseAdmin
      .from("candidate_activity_log")
      .insert(activities);
    if (activityError) throw activityError;

    return { ok: true, bookingGroupId: inserted.bookingGroupId };
  });

export type RescheduleInterviewInput = BookInterviewInput & { previousBookingGroupId: string };

export type RescheduleInterviewResult =
  | { ok: true; bookingGroupId: string; previousBookingGroupId: string }
  | { ok: false; reason: string; message: string };

export const rescheduleInterview = createServerFn({ method: "POST" })
  .inputValidator((data: RescheduleInterviewInput) => data)
  .handler(async ({ data }): Promise<RescheduleInterviewResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Scope by candidate_id so a crafted payload cannot cancel another candidate's booking,
    // and so ignoreBookingGroupId below can only suppress this candidate's own conflicts.
    const { data: previousRows, error: previousError } = await supabaseAdmin
      .from("interviews")
      .select("id, status, scheduled_start, scheduled_end")
      .eq("booking_group_id", data.previousBookingGroupId)
      .eq("candidate_id", data.candidateId)
      .eq("status", "SCHEDULED");
    if (previousError) throw previousError;
    if (!previousRows?.length) {
      return {
        ok: false,
        reason: "NOTHING_TO_RESCHEDULE",
        message: "That booking is no longer scheduled. Refresh and try again.",
      };
    }

    const validation = await validateBooking(supabaseAdmin, data, {
      ignoreBookingGroupId: data.previousBookingGroupId,
    });
    if (!validation.ok) return validation;

    const previousRowIds = previousRows.map((row) => row.id);
    const previousStart = [...previousRows]
      .map((row) => row.scheduled_start)
      .sort()
      .at(0)!;

    const { error: cancelError } = await supabaseAdmin
      .from("interviews")
      .update({ status: "CANCELLED" })
      .eq("booking_group_id", data.previousBookingGroupId)
      .eq("candidate_id", data.candidateId)
      .eq("status", "SCHEDULED");
    if (cancelError) throw cancelError;

    const inserted = await insertBookingGroup(supabaseAdmin, data);
    if (!inserted.ok) {
      const { error: revertError } = await supabaseAdmin
        .from("interviews")
        .update({ status: "SCHEDULED" })
        .in("id", previousRowIds);
      if (revertError) {
        return {
          ok: false,
          reason: "RESCHEDULE_ROLLBACK_FAILED",
          message:
            "Could not rebook or restore the original interview. Refresh and check this candidate's schedule.",
        };
      }
      return {
        ok: false,
        reason: inserted.reason,
        message: `${inserted.message} The existing interview is still scheduled.`,
      };
    }

    const { error: candidateUpdateError } = await supabaseAdmin
      .from("candidates")
      .update({ current_stage: data.stage, status_updated_at: new Date().toISOString() })
      .eq("id", data.candidateId);
    if (candidateUpdateError) throw candidateUpdateError;

    const activities = [
      {
        candidate_id: data.candidateId,
        action_type: "INTERVIEW_RESCHEDULED",
        details: {
          stage: data.stage,
          previous_start: previousStart,
          scheduled_start: data.scheduledStart,
          previous_booking_group_id: data.previousBookingGroupId,
          booking_group_id: inserted.bookingGroupId,
          interviewer_ids: data.interviewerIds,
          booked_by: "AI Orchestrator",
        },
      },
      ...(validation.priorStage === data.stage
        ? []
        : [
            {
              candidate_id: data.candidateId,
              action_type: "STAGE_CHANGED",
              details: { from: validation.priorStage, to: data.stage },
            },
          ]),
    ];
    const { error: activityError } = await supabaseAdmin
      .from("candidate_activity_log")
      .insert(activities);
    if (activityError) throw activityError;

    return {
      ok: true,
      bookingGroupId: inserted.bookingGroupId,
      previousBookingGroupId: data.previousBookingGroupId,
    };
  });

export type CancelInterviewInput = {
  bookingGroupId: string;
  candidateId: string;
  reason: string;
};

export type CancelInterviewResult = { ok: true } | { ok: false; reason: string; message: string };

export const cancelInterview = createServerFn({ method: "POST" })
  .inputValidator((data: CancelInterviewInput) => data)
  .handler(async ({ data }): Promise<CancelInterviewResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const reason = data.reason.trim();
    if (!reason) {
      return {
        ok: false,
        reason: "REASON_REQUIRED",
        message: "A cancellation reason is required.",
      };
    }

    // Scope by candidate_id so a crafted payload cannot cancel another candidate's booking.
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("interviews")
      .select("id, status, stage, scheduled_start, interviewer_id")
      .eq("booking_group_id", data.bookingGroupId)
      .eq("candidate_id", data.candidateId);
    if (rowsError) throw rowsError;
    if (!rows?.length) {
      return { ok: false, reason: "NOT_FOUND", message: "This interview could not be found." };
    }

    const scheduledRows = rows.filter((row) => row.status === "SCHEDULED");
    if (!scheduledRows.length) {
      if (rows.every((row) => row.status === "CANCELLED")) {
        return { ok: true };
      }
      return {
        ok: false,
        reason: "ALREADY_COMPLETED",
        message: "This interview has already been completed and can't be cancelled.",
      };
    }

    const { error: cancelError } = await supabaseAdmin
      .from("interviews")
      .update({ status: "CANCELLED" })
      .eq("booking_group_id", data.bookingGroupId)
      .eq("candidate_id", data.candidateId)
      .eq("status", "SCHEDULED");
    if (cancelError) throw cancelError;

    const interviewerIds = [
      ...new Set(scheduledRows.map((row) => row.interviewer_id).filter(Boolean)),
    ];
    const { error: activityError } = await supabaseAdmin.from("candidate_activity_log").insert({
      candidate_id: data.candidateId,
      action_type: "INTERVIEW_CANCELLED",
      details: {
        booking_group_id: data.bookingGroupId,
        stage: scheduledRows[0]?.stage,
        scheduled_start: scheduledRows[0]?.scheduled_start,
        interviewer_ids: interviewerIds,
        reason,
        cancelled_by: "AI Orchestrator",
      },
    });
    if (activityError) throw activityError;

    return { ok: true };
  });
