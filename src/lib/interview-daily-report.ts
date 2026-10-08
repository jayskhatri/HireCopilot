import { fullName, STAGE_LABEL, type Candidate, type Interview } from "@/lib/hiring";
import { normalizeReportRecipients } from "@/lib/report-recipients";

export const INTERVIEW_DAILY_SCHEDULE_KEY = "hirecopilot.interview-daily-report.schedule";
export const INTERVIEW_DAILY_SCHEDULE_UPDATED_EVENT =
  "hirecopilot:interview-daily-report-schedule-updated";

export type InterviewDailyReportSchedule = {
  time: string;
  nextRunAt: number;
  recipient: string;
};

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localDateRange(dateString: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) throw new Error("Choose a valid report date.");
  const [year, month, day] = dateString.split("-").map(Number);
  const start = new Date(year!, month! - 1, day!);
  if (localDateString(start) !== dateString) throw new Error("Choose a valid report date.");
  const end = new Date(year!, month! - 1, day! + 1);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export function previousLocalDateRange(now = new Date()) {
  const previousDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const reportDate = localDateString(previousDay);
  return { reportDate, ...localDateRange(reportDate) };
}

export function nextInterviewDailyReportRun(time: string, timeZone?: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  if (timeZone) {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const target = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const now = Date.now();
    const firstMinute = Math.floor(now / 60_000) * 60_000 + 60_000;
    for (let offset = 0; offset <= 48 * 60; offset += 1) {
      const candidate = firstMinute + offset * 60_000;
      if (formatter.format(candidate) === target) return candidate;
    }
    throw new Error(`Could not calculate the next run in time zone ${timeZone}.`);
  }
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

export function readInterviewDailyReportSchedule(): InterviewDailyReportSchedule | null {
  try {
    const stored = localStorage.getItem(INTERVIEW_DAILY_SCHEDULE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return null;
    const schedule = parsed as Partial<InterviewDailyReportSchedule>;
    if (
      typeof schedule.time !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time) ||
      typeof schedule.nextRunAt !== "number" ||
      !Number.isFinite(schedule.nextRunAt) ||
      typeof schedule.recipient !== "string" ||
      !isValidRecipientList(schedule.recipient)
    ) {
      localStorage.removeItem(INTERVIEW_DAILY_SCHEDULE_KEY);
      return null;
    }
    return {
      time: schedule.time,
      nextRunAt: schedule.nextRunAt,
      recipient: schedule.recipient,
    };
  } catch {
    return null;
  }
}

function isValidRecipientList(value: string) {
  try {
    return normalizeReportRecipients(value) === value;
  } catch {
    return false;
  }
}

export function writeInterviewDailyReportSchedule(schedule: InterviewDailyReportSchedule) {
  localStorage.setItem(INTERVIEW_DAILY_SCHEDULE_KEY, JSON.stringify(schedule));
  window.dispatchEvent(new Event(INTERVIEW_DAILY_SCHEDULE_UPDATED_EVENT));
}

export function clearInterviewDailyReportSchedule() {
  localStorage.removeItem(INTERVIEW_DAILY_SCHEDULE_KEY);
  window.dispatchEvent(new Event(INTERVIEW_DAILY_SCHEDULE_UPDATED_EVENT));
}

export function buildInterviewDailyReportRows(
  candidates: Candidate[],
  interviews: Interview[],
  reportDate: string,
) {
  const groups = new Map<string, Interview[]>();
  for (const interview of interviews) {
    if (
      !["SCHEDULED", "COMPLETED"].includes(interview.status) ||
      localDateString(new Date(interview.scheduled_start)) !== reportDate
    ) {
      continue;
    }
    const groupId = interview.booking_group_id || interview.id;
    groups.set(groupId, [...(groups.get(groupId) ?? []), interview]);
  }

  const dateTime = (value: string) =>
    new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  return [
    [
      "Activity",
      "Date/time",
      "Candidate",
      "Candidate email",
      "Phone",
      "Role",
      "Stage",
      "Status",
      "Interviewer",
      "Interviewer email",
      "Source",
      "Rejection reason",
    ],
    ...[...groups.values()].map((group) => {
      const interview = group[0]!;
      const names = [...new Set(group.map((item) => item.interviewers?.name).filter(Boolean))];
      const emails = [...new Set(group.map((item) => item.interviewers?.email).filter(Boolean))];
      return [
        interview.status === "SCHEDULED" ? "Interview scheduled" : "Interview completed",
        dateTime(interview.scheduled_start),
        interview.candidates ? fullName(interview.candidates) : "Candidate",
        interview.candidates?.email ?? "",
        interview.candidates?.phone ?? "",
        interview.jobs?.title ?? "Unassigned",
        STAGE_LABEL[interview.stage] ?? interview.stage,
        interview.status,
        names.join(", "),
        emails.join(", "),
        interview.candidates?.source ?? "",
        "",
      ];
    }),
    ...candidates
      .filter(
        (candidate) =>
          candidate.current_stage === "REJECTED" &&
          localDateString(new Date(candidate.status_updated_at)) === reportDate,
      )
      .map((candidate) => [
        "Candidate rejected",
        dateTime(candidate.status_updated_at),
        fullName(candidate),
        candidate.email,
        candidate.phone ?? "",
        candidate.jobs?.title ?? "Unassigned",
        "Rejected",
        "REJECTED",
        "",
        "",
        candidate.source,
        candidate.rejection_reason ?? "",
      ]),
  ];
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  const safe = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function downloadInterviewDailyReportCsv(
  rows: (string | number | null | undefined)[][],
  date: string,
) {
  const csv = buildInterviewDailyReportCsv(rows);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `hirecopilot-interview-activity-${date}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildInterviewDailyReportCsv(rows: (string | number | null | undefined)[][]) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
