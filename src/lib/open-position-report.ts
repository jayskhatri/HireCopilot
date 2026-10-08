import { formatDate, type Candidate, type Job } from "@/lib/hiring";

// Report schedules are persisted only in this browser; delivery is a CSV download.
export const OPEN_POSITION_SCHEDULE_KEY = "hirecopilot.open-position-report.schedule";
export const OPEN_POSITION_SCHEDULE_UPDATED_EVENT = "hirecopilot:open-position-schedule-updated";
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type ReportSchedule = {
  frequency: "daily" | "weekly";
  dayOfWeek: number;
  time: string;
  nextRunAt: number;
};

export function nextReportScheduleRun(
  frequency: ReportSchedule["frequency"],
  time: string,
  dayOfWeek: number,
  timeZone?: string,
) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  if (timeZone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const targetTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const firstMinute = Math.floor(Date.now() / 60_000) * 60_000 + 60_000;
    for (let offset = 0; offset <= 8 * 24 * 60; offset += 1) {
      const candidate = firstMinute + offset * 60_000;
      const parts = formatter.formatToParts(candidate);
      const weekday = parts.find((part) => part.type === "weekday")?.value;
      const hour = parts.find((part) => part.type === "hour")?.value;
      const minute = parts.find((part) => part.type === "minute")?.value;
      const matchesTime = `${hour}:${minute}` === targetTime;
      const matchesDay = frequency === "daily" || weekdays.indexOf(weekday ?? "") === dayOfWeek;
      if (matchesTime && matchesDay) return candidate;
    }
    throw new Error(`Could not calculate the next run in time zone ${timeZone}.`);
  }
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);

  if (frequency === "daily") {
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  } else {
    const daysUntil = (dayOfWeek - next.getDay() + 7) % 7;
    if (daysUntil === 0 && next.getTime() <= Date.now()) {
      next.setDate(next.getDate() + 7);
    } else if (daysUntil > 0) {
      next.setDate(next.getDate() + daysUntil);
    }
  }
  return next.getTime();
}

export function readOpenPositionReportSchedule(): ReportSchedule | null {
  try {
    const stored = localStorage.getItem(OPEN_POSITION_SCHEDULE_KEY);
    if (!stored) return null;

    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return null;
    const schedule = parsed as Partial<ReportSchedule>;
    if (
      (schedule.frequency !== "daily" && schedule.frequency !== "weekly") ||
      !Number.isInteger(schedule.dayOfWeek) ||
      schedule.dayOfWeek! < 0 ||
      schedule.dayOfWeek! > 6 ||
      typeof schedule.time !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time) ||
      typeof schedule.nextRunAt !== "number" ||
      !Number.isFinite(schedule.nextRunAt)
    ) {
      localStorage.removeItem(OPEN_POSITION_SCHEDULE_KEY);
      return null;
    }
    return {
      frequency: schedule.frequency,
      dayOfWeek: schedule.dayOfWeek!,
      time: schedule.time,
      nextRunAt: schedule.nextRunAt,
    };
  } catch {
    return null;
  }
}

export function writeOpenPositionReportSchedule(schedule: ReportSchedule) {
  localStorage.setItem(OPEN_POSITION_SCHEDULE_KEY, JSON.stringify(schedule));
  window.dispatchEvent(new Event(OPEN_POSITION_SCHEDULE_UPDATED_EVENT));
}

export function clearOpenPositionReportSchedule() {
  localStorage.removeItem(OPEN_POSITION_SCHEDULE_KEY);
  window.dispatchEvent(new Event(OPEN_POSITION_SCHEDULE_UPDATED_EVENT));
}

function csvValue(value: string | number | undefined) {
  const text = value === undefined ? "" : String(value);
  const safe = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function downloadOpenPositionsCsv(positions: Job[], candidates: Candidate[]) {
  const rows = [
    [
      "Job code",
      "Position",
      "Department",
      "Location",
      "Required skills",
      "Assigned candidates",
      "Opened",
    ],
    ...positions.map((job) => [
      job.job_code,
      job.title,
      job.departments?.name ?? job.department,
      job.location,
      job.required_skills.join(", "),
      String(candidates.filter((candidate) => candidate.job_id === job.id).length),
      job.open_since ? formatDate(job.open_since) : "",
    ]),
  ];
  const csv = rows.map((row) => row.map(csvValue).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `hirecopilot-open-positions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
