import { AppShell } from "@/components/app-shell";
import { InterviewDailyReport } from "@/components/interview-daily-report";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { configureGoogleDailyInterviewReport } from "@/lib/google-apps-script-report.functions";
import {
  candidatesQuery,
  daysInStage,
  formatDate,
  fullName,
  interviewsQuery,
  jobsQuery,
  slaLevel,
  STAGE_LABEL,
  type Candidate,
  type Job,
} from "@/lib/hiring";
import { normalizeReportRecipients } from "@/lib/report-recipients";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, BriefcaseBusiness, CalendarClock, Download, Eye, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  clearOpenPositionReportSchedule,
  downloadOpenPositionsCsv,
  nextReportScheduleRun,
  OPEN_POSITION_SCHEDULE_UPDATED_EVENT,
  readOpenPositionReportSchedule,
  WEEKDAYS,
  writeOpenPositionReportSchedule,
  type ReportSchedule,
} from "../lib/open-position-report";

const EMPTY_CANDIDATES: Candidate[] = [];
const EMPTY_JOBS: Job[] = [];

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Hiring Reports — HireCopilot" },
      {
        name: "description",
        content:
          "SLA breach reports, interview logs and exportable hiring summaries for leadership.",
      },
      { property: "og:title", content: "Hiring Reports — HireCopilot" },
      {
        property: "og:description",
        content: "SLA breaches, interview logs and exportable summaries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const candidates = useQuery(candidatesQuery);
  const interviews = useQuery(interviewsQuery);
  const jobs = useQuery(jobsQuery);
  const [reportOpen, setReportOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<ReportSchedule | null>(null);
  const [frequency, setFrequency] = useState<ReportSchedule["frequency"]>("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [time, setTime] = useState("09:00");
  const [recipient, setRecipient] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInEmail, setSignInEmail] = useState("");
  const [sendingSignInLink, setSendingSignInLink] = useState(false);
  const [savingOpenSchedule, setSavingOpenSchedule] = useState(false);
  const [sendingOpenTest, setSendingOpenTest] = useState(false);
  const [openReportTimeZone, setOpenReportTimeZone] = useState("");
  const [openReportStatusMessage, setOpenReportStatusMessage] = useState("");
  const list = candidates.data ?? EMPTY_CANDIDATES;
  const openPositions = (jobs.data ?? EMPTY_JOBS).filter((job) => job.status === "OPEN");
  const stuck = list.filter(
    (c) => !["OFFER", "REJECTED"].includes(c.current_stage) && slaLevel(daysInStage(c)) !== "ok",
  );

  useEffect(() => {
    const syncSchedule = () => {
      const stored = readOpenPositionReportSchedule();
      setSchedule(stored);
      if (!stored) return;
      setFrequency(stored.frequency);
      setDayOfWeek(stored.dayOfWeek);
      setTime(stored.time);
    };
    syncSchedule();
    window.addEventListener(OPEN_POSITION_SCHEDULE_UPDATED_EVENT, syncSchedule);
    window.addEventListener("storage", syncSchedule);
    return () => {
      window.removeEventListener(OPEN_POSITION_SCHEDULE_UPDATED_EVENT, syncSchedule);
      window.removeEventListener("storage", syncSchedule);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const syncRemoteSchedule = async () => {
      try {
        const result = await configureGoogleDailyInterviewReport({
          data: { action: "status", reportType: "openPositions" },
        });
        if (!active) return;
        setOpenReportStatusMessage("");
        setOpenReportTimeZone(result.timeZone ?? "");
        if (
          result.scheduled &&
          result.recipient &&
          Number.isInteger(result.hour) &&
          Number.isInteger(result.minute)
        ) {
          const remoteTime = `${String(result.hour).padStart(2, "0")}:${String(result.minute).padStart(2, "0")}`;
          const remoteSchedule: ReportSchedule = {
            frequency: result.frequency === "weekly" ? "weekly" : "daily",
            dayOfWeek: Number.isInteger(result.dayOfWeek) ? result.dayOfWeek! : 1,
            time: remoteTime,
            nextRunAt: nextReportScheduleRun(
              result.frequency === "weekly" ? "weekly" : "daily",
              remoteTime,
              Number.isInteger(result.dayOfWeek) ? result.dayOfWeek! : 1,
              result.timeZone,
            ),
          };
          setSchedule(remoteSchedule);
          setFrequency(remoteSchedule.frequency);
          setDayOfWeek(remoteSchedule.dayOfWeek);
          setTime(remoteTime);
          setRecipient(result.recipient);
          try {
            writeOpenPositionReportSchedule(remoteSchedule);
          } catch {
            // Apps Script remains the source of truth; local storage is a UI cache only.
          }
        } else {
          setSchedule(null);
          clearOpenPositionReportSchedule();
        }
      } catch (error) {
        if (active) {
          setOpenReportStatusMessage(
            error instanceof Error
              ? error.message
              : "Could not verify the open positions email schedule.",
          );
        }
      }
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
      const email = data.session?.user.email?.trim().toLowerCase();
      if (email) setRecipient((current) => current || email);
      if (data.session) void syncRemoteSchedule();
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      const email = session?.user.email?.trim().toLowerCase();
      if (email) setRecipient((current) => current || email);
      if (session) void syncRemoteSchedule();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  function exportCsv() {
    const reportCandidates = list.filter((c) => !["OFFER", "REJECTED"].includes(c.current_stage));
    const rows = [
      ["Candidate", "Role", "Stage", "Days in stage", "SLA"],
      ...reportCandidates.map((c) => [
        fullName(c),
        c.jobs?.title ?? "",
        STAGE_LABEL[c.current_stage],
        String(daysInStage(c)),
        slaLevel(daysInStage(c)),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "hirecopilot-pipeline.csv";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Pipeline report exported");
  }

  async function saveSchedule() {
    let normalizedRecipient: string;
    try {
      normalizedRecipient = normalizeReportRecipients(recipient);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check the recipient email addresses.");
      return;
    }
    if (!signedIn) {
      setSignInOpen(true);
      toast.error("Sign in with an approved report operator account to schedule automatic email.");
      return;
    }
    setSavingOpenSchedule(true);
    try {
      const result = await configureGoogleDailyInterviewReport({
        data: {
          action: "schedule",
          reportType: "openPositions",
          recipient: normalizedRecipient,
          time,
          frequency,
          dayOfWeek,
        },
      });
      const next = {
        frequency,
        dayOfWeek,
        time,
        nextRunAt: nextReportScheduleRun(frequency, time, dayOfWeek, result.timeZone),
      } satisfies ReportSchedule;
      setSchedule(next);
      setRecipient(normalizedRecipient);
      setOpenReportTimeZone(result.timeZone ?? "");
      setOpenReportStatusMessage("");
      setScheduleOpen(false);
      try {
        writeOpenPositionReportSchedule(next);
      } catch {
        // The server-side trigger is already configured; local storage is only a UI cache.
      }
      toast.success("Automatic open positions email configured");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not configure open positions email.",
      );
    } finally {
      setSavingOpenSchedule(false);
    }
  }

  async function cancelSchedule() {
    if (!signedIn) {
      setSignInOpen(true);
      toast.error("Sign in with an approved report operator account to cancel automatic email.");
      return;
    }
    try {
      await configureGoogleDailyInterviewReport({
        data: { action: "cancel", reportType: "openPositions" },
      });
      clearOpenPositionReportSchedule();
      setSchedule(null);
      setOpenReportStatusMessage("");
      toast.success("Automatic open positions email cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel the email schedule.");
    }
  }

  async function sendOpenPositionsTest() {
    let normalizedRecipient: string;
    try {
      normalizedRecipient = normalizeReportRecipients(recipient);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check the recipient email addresses.");
      return;
    }
    if (!signedIn) {
      setSignInOpen(true);
      toast.error("Sign in with an approved report operator account to send a test.");
      return;
    }
    setSendingOpenTest(true);
    try {
      await configureGoogleDailyInterviewReport({
        data: { action: "sendNow", reportType: "openPositions", recipient: normalizedRecipient },
      });
      toast.success("Open positions report emailed with its CSV attachment.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send the open positions test.",
      );
    } finally {
      setSendingOpenTest(false);
    }
  }

  async function sendSignInLink() {
    const email = signInEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid approved report operator email address.");
      return;
    }
    setSendingSignInLink(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href },
      });
      if (error) throw error;
      setSignInOpen(false);
      toast.success("Sign-in link sent. Open it, then configure the open positions schedule.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the sign-in link.");
    } finally {
      setSendingSignInLink(false);
    }
  }

  function openScheduleDialog() {
    if (schedule) {
      setFrequency(schedule.frequency);
      setDayOfWeek(schedule.dayOfWeek);
      setTime(schedule.time);
    }
    setScheduleOpen(true);
  }

  return (
    <AppShell title="Reports" subtitle="Everything leadership asks for, one click away.">
      <div className="flex flex-wrap gap-3">
        <Button onClick={exportCsv}>
          <Download className="mr-2 size-4" /> Export pipeline CSV
        </Button>
      </div>

      <Card className="mt-5 gap-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BriefcaseBusiness className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-base font-semibold">Open positions report</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Current openings, departments, locations, required skills and assigned candidate
                counts.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {jobs.isLoading
                  ? "Loading positions…"
                  : `${openPositions.length} open ${openPositions.length === 1 ? "position" : "positions"}`}
                {schedule && (
                  <>
                    {" "}
                    · Scheduled{" "}
                    {schedule.frequency === "weekly"
                      ? `every ${WEEKDAYS[schedule.dayOfWeek]}`
                      : "daily"}{" "}
                    at {schedule.time} ({openReportTimeZone || "Apps Script time zone"})
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => setReportOpen(true)}
              disabled={jobs.isLoading}
            >
              <Eye className="mr-2 size-4" /> Open report
            </Button>
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => downloadOpenPositionsCsv(openPositions, list)}
              disabled={jobs.isLoading}
            >
              <Download className="mr-2 size-4" /> Download CSV
            </Button>
            <Button className="w-full sm:w-auto" onClick={openScheduleDialog}>
              <CalendarClock className="mr-2 size-4" />{" "}
              {schedule ? "Edit schedule" : "Schedule report"}
            </Button>
            {schedule && (
              <Button
                variant="ghost"
                size="icon"
                onClick={cancelSchedule}
                aria-label="Cancel report schedule"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>
        {schedule && (
          <p className="mt-4 break-words rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Scheduled for {new Date(schedule.nextRunAt).toLocaleString()}
            {openReportTimeZone ? ` (${openReportTimeZone})` : ""}. The CSV is attached
            automatically.
          </p>
        )}
        {!schedule && (
          <p className="mt-4 break-words rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {openReportStatusMessage ||
              "Schedule daily or weekly Gmail delivery with a CSV attachment. The Apps Script trigger runs while HireCopilot is closed."}
          </p>
        )}
      </Card>

      <InterviewDailyReport
        candidates={list}
        interviews={interviews.data ?? []}
        loading={candidates.isLoading || interviews.isLoading}
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="gap-0 p-5">
          <p className="flex items-center gap-2 font-display text-base font-semibold">
            <AlertTriangle className="size-4 text-destructive" /> SLA breach report
          </p>
          <div className="mt-3 divide-y divide-border">
            {stuck.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{fullName(c)}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.jobs?.title ?? "Unassigned"} · {STAGE_LABEL[c.current_stage]}
                  </p>
                </div>
                <Badge
                  className="shrink-0"
                  variant={slaLevel(daysInStage(c)) === "breach" ? "destructive" : "secondary"}
                >
                  {daysInStage(c)} days
                </Badge>
              </div>
            ))}
            {!stuck.length && (
              <p className="py-4 text-sm text-muted-foreground">No SLA breaches. Nice.</p>
            )}
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <p className="font-display text-base font-semibold">Interview log</p>
          <div className="mt-3 divide-y divide-border">
            {(interviews.data ?? []).slice(0, 12).map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {i.candidates ? fullName(i.candidates) : "Candidate"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {STAGE_LABEL[i.stage] ?? i.stage} · {i.interviewers?.name ?? "Panel"} ·{" "}
                    {formatDate(i.scheduled_start)}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {i.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Open positions report</DialogTitle>
            <DialogDescription>
              Live snapshot generated {new Date().toLocaleString()} · {openPositions.length} open{" "}
              {openPositions.length === 1 ? "position" : "positions"}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Position</th>
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Candidates</th>
                  <th className="px-3 py-3">Required skills</th>
                  <th className="px-3 py-3">Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {openPositions.map((job) => (
                  <tr key={job.id}>
                    <td className="px-3 py-3">
                      <p className="font-medium">{job.job_code}</p>
                      <p className="text-xs text-muted-foreground">{job.title}</p>
                    </td>
                    <td className="px-3 py-3">{job.departments?.name ?? job.department}</td>
                    <td className="px-3 py-3">{job.location}</td>
                    <td className="px-3 py-3">
                      {list.filter((candidate) => candidate.job_id === job.id).length}
                    </td>
                    <td className="max-w-56 px-3 py-3 text-muted-foreground">
                      {job.required_skills.join(", ") || "—"}
                    </td>
                    <td className="px-3 py-3">
                      {job.open_since ? formatDate(job.open_since) : "—"}
                    </td>
                  </tr>
                ))}
                {!jobs.isLoading && !openPositions.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No open positions to report.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>
              Close
            </Button>
            <Button onClick={() => downloadOpenPositionsCsv(openPositions, list)}>
              <Download className="mr-2 size-4" /> Download CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {schedule ? "Update open positions email" : "Schedule open positions email"}
            </DialogTitle>
            <DialogDescription>
              Google Apps Script sends the open positions CSV attachment at the selected time, even
              while HireCopilot is closed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="report-frequency">Repeat</Label>
              <select
                id="report-frequency"
                value={frequency}
                onChange={(event) =>
                  setFrequency(event.target.value as ReportSchedule["frequency"])
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
              </select>
            </div>
            {frequency === "weekly" && (
              <div className="space-y-2">
                <Label htmlFor="report-weekday">Day of week</Label>
                <select
                  id="report-weekday"
                  value={dayOfWeek}
                  onChange={(event) => setDayOfWeek(Number(event.target.value))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {WEEKDAYS.map((weekday, index) => (
                    <option key={weekday} value={index}>
                      {weekday}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="open-positions-recipient">Send email to</Label>
              <Input
                id="open-positions-recipient"
                type="text"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="first@example.com, second@example.com"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Separate addresses with commas or semicolons (up to 50). Recipients can see one
                another&apos;s addresses.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="report-time">
                Send at ({openReportTimeZone || "Apps Script time zone"})
              </Label>
              <Input
                id="report-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            {signedIn && (
              <Button
                variant="outline"
                onClick={() => void sendOpenPositionsTest()}
                disabled={sendingOpenTest}
              >
                {sendingOpenTest ? "Sending…" : "Send test now"}
              </Button>
            )}
            {signedIn ? (
              <Button onClick={() => void saveSchedule()} disabled={savingOpenSchedule}>
                {savingOpenSchedule ? "Saving…" : "Save email schedule"}
              </Button>
            ) : (
              <Button onClick={() => setSignInOpen(true)}>Sign in to schedule</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={signInOpen} onOpenChange={setSignInOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in to manage automatic reports</DialogTitle>
            <DialogDescription>
              Only server-approved report operators can manage automatic email schedules.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="open-report-operator-email">Approved operator email</Label>
            <Input
              id="open-report-operator-email"
              type="email"
              value={signInEmail}
              onChange={(event) => setSignInEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@company.com"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSignInOpen(false)}
              disabled={sendingSignInLink}
            >
              Cancel
            </Button>
            <Button onClick={() => void sendSignInLink()} disabled={sendingSignInLink}>
              {sendingSignInLink ? "Sending…" : "Email sign-in link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
