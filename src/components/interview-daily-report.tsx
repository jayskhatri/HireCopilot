/* eslint-disable prettier/prettier */
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
import { formatDate, fullName, STAGE_LABEL, type Candidate, type Interview } from "@/lib/hiring";
import {
    buildInterviewDailyReportRows,
    clearInterviewDailyReportSchedule,
    downloadInterviewDailyReportCsv,
    INTERVIEW_DAILY_SCHEDULE_UPDATED_EVENT,
    localDateString,
    nextInterviewDailyReportRun,
    readInterviewDailyReportSchedule,
    writeInterviewDailyReportSchedule,
    type InterviewDailyReportSchedule,
} from "@/lib/interview-daily-report";
import { normalizeReportRecipients } from "@/lib/report-recipients";
import { CalendarClock, CheckCircle2, Clock3, Download, UserRoundX, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Props = { candidates: Candidate[]; interviews: Interview[]; loading: boolean };

function dateTime(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function InterviewDailyReport({ candidates, interviews, loading }: Props) {
  const [reportDate, setReportDate] = useState(localDateString());
  const [schedule, setSchedule] = useState<InterviewDailyReportSchedule | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [time, setTime] = useState("09:00");
  const [recipient, setRecipient] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInEmail, setSignInEmail] = useState("");
  const [sendingSignInLink, setSendingSignInLink] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scriptTimeZone, setScriptTimeZone] = useState("");
  const [remoteStatusMessage, setRemoteStatusMessage] = useState("");

  useEffect(() => {
    const syncSchedule = () => {
      const stored = readInterviewDailyReportSchedule();
      setSchedule(stored);
      if (stored) {
        setTime(stored.time);
        setRecipient(stored.recipient);
      }
    };
    syncSchedule();
    window.addEventListener(INTERVIEW_DAILY_SCHEDULE_UPDATED_EVENT, syncSchedule);
    window.addEventListener("storage", syncSchedule);
    return () => {
      window.removeEventListener(INTERVIEW_DAILY_SCHEDULE_UPDATED_EVENT, syncSchedule);
      window.removeEventListener("storage", syncSchedule);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const syncGoogleSchedule = async () => {
      try {
        const result = await configureGoogleDailyInterviewReport({ data: { action: "status" } });
        if (!active) return;
        setRemoteStatusMessage("");
        setScriptTimeZone(result.timeZone ?? "");
        if (result.scheduled && result.recipient && Number.isInteger(result.hour) && Number.isInteger(result.minute)) {
          const remoteTime = `${String(result.hour).padStart(2, "0")}:${String(result.minute).padStart(2, "0")}`;
          const remoteSchedule = {
            time: remoteTime,
            nextRunAt: nextInterviewDailyReportRun(remoteTime, result.timeZone),
            recipient: result.recipient,
          } satisfies InterviewDailyReportSchedule;
          setSchedule(remoteSchedule);
          setTime(remoteTime);
          setRecipient(result.recipient);
          writeInterviewDailyReportSchedule(remoteSchedule);
        } else {
          setSchedule(null);
          clearInterviewDailyReportSchedule();
        }
      } catch (error) {
        if (active) {
          setRemoteStatusMessage(
            error instanceof Error ? error.message : "Could not verify the Gmail report trigger.",
          );
        }
      }
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
      const email = data.session?.user.email?.trim().toLowerCase();
      if (email) setRecipient((current) => current || email);
      if (data.session) void syncGoogleSchedule();
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      const email = session?.user.email?.trim().toLowerCase();
      if (email) setRecipient((current) => current || email);
      if (session) void syncGoogleSchedule();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const dayInterviews = useMemo(
    () => {
      const dayItems = interviews.filter(
        (interview) => localDateString(new Date(interview.scheduled_start)) === reportDate,
      );
      const groups = new Map<string, Interview[]>();
      for (const interview of dayItems) {
        const key = interview.booking_group_id || interview.id;
        groups.set(key, [...(groups.get(key) ?? []), interview]);
      }
      return [...groups.values()].map((group) => {
        const first = group[0]!;
        const interviewerNames = [
          ...new Set(group.map((item) => item.interviewers?.name).filter(Boolean)),
        ];
        const interviewerEmails = [
          ...new Set(group.map((item) => item.interviewers?.email).filter(Boolean)),
        ];
        return {
          ...first,
          interviewers: first.interviewers
            ? {
                ...first.interviewers,
                name: interviewerNames.join(", "),
                email: interviewerEmails.join(", "),
              }
            : null,
        };
      });
    },
    [interviews, reportDate],
  );
  const scheduled = dayInterviews.filter((interview) => interview.status === "SCHEDULED");
  const completed = dayInterviews.filter((interview) => interview.status === "COMPLETED");
  const rejected = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          candidate.current_stage === "REJECTED" &&
          localDateString(new Date(candidate.status_updated_at)) === reportDate,
      ),
    [candidates, reportDate],
  );

  function csvRows() {
    return buildInterviewDailyReportRows(candidates, interviews, reportDate);
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
      toast.error("Sign in with an approved report operator account to enable automatic email.");
      return;
    }
    setSavingSchedule(true);
    try {
      const remoteResult = await configureGoogleDailyInterviewReport({
        data: { action: "schedule", recipient: normalizedRecipient, time },
      });
      const next = {
        time,
        nextRunAt: nextInterviewDailyReportRun(time, remoteResult.timeZone),
        recipient: normalizedRecipient,
      } satisfies InterviewDailyReportSchedule;
      setSchedule(next);
      setScriptTimeZone(remoteResult.timeZone ?? "");
      setRemoteStatusMessage("");
      setScheduleOpen(false);
      try {
        writeInterviewDailyReportSchedule(next);
      } catch {
        // The Apps Script trigger is already configured; local storage is only a UI cache.
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not configure automatic email.");
      setSavingSchedule(false);
      return;
    }
    toast.success("Automatic daily Gmail report configured");
    setSavingSchedule(false);
  }

  async function cancelSchedule() {
    if (!signedIn) {
      setSignInOpen(true);
      toast.error("Sign in with an approved report operator account to cancel automatic email.");
      return;
    }
    try {
      await configureGoogleDailyInterviewReport({ data: { action: "cancel" } });
      clearInterviewDailyReportSchedule();
      setSchedule(null);
      setRemoteStatusMessage("");
      toast.success("Automatic daily email schedule cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel automatic email.");
    }
  }

  async function sendTestReport() {
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
    setSendingTest(true);
    try {
      await configureGoogleDailyInterviewReport({
        data: { action: "sendNow", recipient: normalizedRecipient, reportDate },
      });
      toast.success(`Interview report for ${reportDate} was emailed with its CSV attachment.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the test report.");
    } finally {
      setSendingTest(false);
    }
  }

  async function sendSignInLink() {
    const email = signInEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid management email address.");
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
      toast.success("Sign-in link sent. Open it, then configure the report schedule.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the sign-in link.");
    } finally {
      setSendingSignInLink(false);
    }
  }

  return (
    <Card className="mt-5 gap-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarClock className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-base font-semibold">Daily interview activity report</p>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Scheduled and completed interviews plus candidates rejected on a selected day, with candidate, role, interviewer and rejection details.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadInterviewDailyReportCsv(csvRows(), reportDate)} disabled={loading}>
            <Download className="mr-2 size-4" /> Download CSV
          </Button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="w-full space-y-2 sm:w-auto">
          <Label htmlFor="interview-report-date">Report date (local time)</Label>
          <Input id="interview-report-date" type="date" value={reportDate} max={localDateString()} onChange={(event) => setReportDate(event.target.value)} className="w-full sm:w-48" />
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:justify-end">
          {schedule ? (
            <p className="min-w-0 basis-full break-words text-xs text-muted-foreground xl:basis-auto">
              Scheduled daily at {schedule.time}{scriptTimeZone ? ` (${scriptTimeZone})` : ""} · next run about {new Date(schedule.nextRunAt).toLocaleString()}
            </p>
          ) : null}
          <Button variant="outline" onClick={() => { if (schedule) { setTime(schedule.time); setRecipient(schedule.recipient); } setScheduleOpen(true); }}>
            <Clock3 className="mr-2 size-4" /> {schedule ? "Edit email schedule" : "Schedule automatic email"}
          </Button>
          {schedule && <Button variant="ghost" size="icon" onClick={cancelSchedule} aria-label="Cancel daily interview report schedule"><X className="size-4" /></Button>}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <CountCard icon={<Clock3 className="size-4" />} label="Scheduled interviews" count={scheduled.length} />
        <CountCard icon={<CheckCircle2 className="size-4" />} label="Completed interviews" count={completed.length} />
        <CountCard icon={<UserRoundX className="size-4" />} label="Candidates rejected" count={rejected.length} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section>
          <h3 className="mb-2 font-display text-sm font-semibold">Interview details</h3>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Candidate / role</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Time</th><th className="px-3 py-2">Interviewer</th><th className="px-3 py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-border">
                {dayInterviews.filter((item) => item.status === "SCHEDULED" || item.status === "COMPLETED").map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2"><p className="font-medium">{item.candidates ? fullName(item.candidates) : "Candidate"}</p><p className="text-xs text-muted-foreground">{item.jobs?.title ?? "Unassigned"} · {item.candidates?.email ?? ""}</p></td>
                    <td className="px-3 py-2">{STAGE_LABEL[item.stage] ?? item.stage}</td>
                    <td className="px-3 py-2">{formatDate(item.scheduled_start)}<p className="text-xs text-muted-foreground">{new Date(item.scheduled_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></td>
                    <td className="px-3 py-2">{item.interviewers?.name ?? "—"}</td>
                    <td className="px-3 py-2"><Badge variant={item.status === "COMPLETED" ? "secondary" : "outline"}>{item.status}</Badge></td>
                  </tr>
                ))}
                {!loading && dayInterviews.filter((item) => item.status === "SCHEDULED" || item.status === "COMPLETED").length === 0 && <EmptyRow columns={5} text="No scheduled or completed interviews for this date." />}
                {loading && <EmptyRow columns={5} text="Loading interview activity…" />}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h3 className="mb-2 font-display text-sm font-semibold">Rejected candidates</h3>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Candidate / contact</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Rejected at</th><th className="px-3 py-2">Reason</th></tr></thead>
              <tbody className="divide-y divide-border">
                {rejected.map((candidate) => <tr key={candidate.id}><td className="px-3 py-2"><p className="font-medium">{fullName(candidate)}</p><p className="text-xs text-muted-foreground">{candidate.email}{candidate.phone ? ` · ${candidate.phone}` : ""}</p></td><td className="px-3 py-2">{candidate.jobs?.title ?? "Unassigned"}</td><td className="px-3 py-2">{dateTime(candidate.status_updated_at)}</td><td className="max-w-56 px-3 py-2 text-muted-foreground">{candidate.rejection_reason || "—"}</td></tr>)}
                {!loading && rejected.length === 0 && <EmptyRow columns={4} text="No candidates rejected for this date." />}
                {loading && <EmptyRow columns={4} text="Loading rejection activity…" />}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <p className="mt-4 break-words rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        {remoteStatusMessage ||
          (schedule
            ? `Google Apps Script sends the previous calendar day’s report with a CSV attachment, even while this app is closed.${scriptTimeZone ? ` Script time zone: ${scriptTimeZone}.` : ""}`
            : "Automatic Gmail delivery needs the one-time Google Apps Script setup documented in LOCAL-SETUP.md. When enabled, scheduled emails run even while HireCopilot is closed.")}
      </p>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{schedule ? "Update automatic daily report" : "Schedule automatic daily report"}</DialogTitle>
            <DialogDescription>Google Apps Script sends the previous calendar day&apos;s CSV attachment from your configured Gmail account, whether or not HireCopilot is open.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="interview-daily-recipient">Send report to</Label>
              <Input id="interview-daily-recipient" type="text" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="first@example.com, second@example.com" autoComplete="off" />
              <p className="text-xs text-muted-foreground">
                Separate addresses with commas or semicolons (up to 50). Recipients can see one
                another&apos;s addresses.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="interview-daily-time">Send at ({scriptTimeZone || "Apps Script time zone"})</Label>
              <Input id="interview-daily-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            {signedIn && <Button variant="outline" onClick={() => void sendTestReport()} disabled={sendingTest}>{sendingTest ? "Sending…" : "Send test now"}</Button>}
            {signedIn ? <Button onClick={() => void saveSchedule()} disabled={savingSchedule}>{savingSchedule ? "Saving…" : "Save automatic schedule"}</Button> : <Button onClick={() => setSignInOpen(true)}>Sign in to schedule</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={signInOpen} onOpenChange={setSignInOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in to manage automatic reports</DialogTitle>
            <DialogDescription>Only server-approved report operators can create or cancel email schedules.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="report-operator-email">Approved operator email</Label>
            <Input id="report-operator-email" type="email" value={signInEmail} onChange={(event) => setSignInEmail(event.target.value)} autoComplete="email" placeholder="you@company.com" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignInOpen(false)} disabled={sendingSignInLink}>Cancel</Button>
            <Button onClick={() => void sendSignInLink()} disabled={sendingSignInLink}>{sendingSignInLink ? "Sending…" : "Email sign-in link"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Card>
  );
}

function CountCard({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3"><div className="text-primary">{icon}</div><div><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-xl font-semibold">{count}</p></div></div>;
}

function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return <tr><td colSpan={columns} className="px-3 py-6 text-center text-sm text-muted-foreground">{text}</td></tr>;
}
