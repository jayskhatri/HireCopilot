import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
import {
    fullName,
    jobLabel,
    jobsQuery,
    logActivity,
    STAGE_LABEL,
    STAGES,
    type Candidate,
} from "@/lib/hiring";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const SOURCES = ["Referral", "LinkedIn", "Careers site", "Agency"] as const;

const schema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim(),
  job_id: z.string(),
  source: z.string(),
  experience_years: z.number().min(0, "Minimum 0").max(50, "Maximum 50"),
  skills: z.string(),
  current_stage: z.string(),
});

type FormState = z.infer<typeof schema>;

const EMPTY: FormState = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  job_id: "",
  source: "Referral",
  experience_years: 5,
  skills: "",
  current_stage: "SCREENING",
};

const db = supabase;

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function CandidateFormDialog({
  open,
  onOpenChange,
  candidate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: Candidate | null;
}) {
  const jobs = useQuery(jobsQuery);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (candidate) {
      setForm({
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        email: candidate.email,
        phone: candidate.phone ?? "",
        job_id: candidate.job_id ?? "",
        source: candidate.source,
        experience_years: candidate.experience_years,
        skills: candidate.skills.join(", "),
        current_stage: candidate.current_stage,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, candidate]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function save() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setSaving(true);
    setError(null);
    const skills = parsed.data.skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      job_id: parsed.data.job_id || null,
      source: parsed.data.source,
      experience_years: parsed.data.experience_years,
      skills,
    };
    try {
      if (candidate) {
        const stageChanged = candidate.current_stage !== parsed.data.current_stage;
        const { error: err } = await db
          .from("candidates")
          .update({
            ...payload,
            current_stage: parsed.data.current_stage,
            ...(stageChanged ? { status_updated_at: new Date().toISOString() } : {}),
          })
          .eq("id", candidate.id);
        if (err) throw err;
        if (stageChanged) {
          await logActivity(candidate.id, "STAGE_CHANGED", {
            from: candidate.current_stage,
            to: parsed.data.current_stage,
          });
        }
        toast.success(`${fullName(candidate)} updated`);
      } else {
        const { data, error: err } = await db
          .from("candidates")
          .insert({ ...payload, current_stage: parsed.data.current_stage })
          .select("id")
          .single();
        if (err) throw err;
        if (data?.id) {
          await logActivity(data.id, "APPLICATION_RECEIVED", {
            source: parsed.data.source,
            stage: parsed.data.current_stage,
          });
        }
        toast.success(`${parsed.data.first_name} ${parsed.data.last_name} added`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["candidates"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
      onOpenChange(false);
    } catch (e) {
      const message = messageFrom(e, "Something went wrong");
      const msg = message.includes("duplicate")
        ? "A candidate with this email already exists"
        : message;
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{candidate ? "Edit candidate" : "Add candidate"}</DialogTitle>
          <DialogDescription>
            {candidate
              ? "Update details. Changing the stage restarts the time-in-stage clock."
              : "The candidate joins the pipeline at the stage you pick."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cf-first">First name</Label>
            <Input
              id="cf-first"
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-last">Last name</Label>
            <Input
              id="cf-last"
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-email">Email</Label>
            <Input
              id="cf-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-phone">Phone</Label>
            <Input
              id="cf-phone"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-job">Position</Label>
            <select
              id="cf-job"
              value={form.job_id}
              onChange={(e) => set("job_id", e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Unassigned</option>
              {(jobs.data ?? []).map((j) => (
                <option key={j.id} value={j.id}>
                  {jobLabel(j)}
                  {j.status === "CLOSED" ? " (closed)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-source">Source</Label>
            <select
              id="cf-source"
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-exp">Experience (years)</Label>
            <Input
              id="cf-exp"
              type="number"
              min={0}
              max={50}
              value={form.experience_years}
              onChange={(e) => set("experience_years", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-stage">Stage</Label>
            <select
              id="cf-stage"
              value={form.current_stage}
              onChange={(e) => set("current_stage", e.target.value)}
              disabled={candidate?.current_stage === "REJECTED"}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {STAGES.filter(
                (s) => s !== "REJECTED" || candidate?.current_stage === "REJECTED",
              ).map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
            {candidate?.current_stage === "REJECTED" && (
              <p className="text-xs text-muted-foreground">
                Rejected candidates can only be moved via Un-reject.
              </p>
            )}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cf-skills">Skills (comma separated)</Label>
            <Input
              id="cf-skills"
              placeholder="React, Node.js, PostgreSQL"
              value={form.skills}
              onChange={(e) => set("skills", e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : candidate ? "Save changes" : "Add candidate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCandidateDialog({
  candidate,
  onOpenChange,
  onDeleted,
}: {
  candidate: Candidate | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!candidate) return;
    setDeleting(true);
    try {
      const { data: interviewRows } = await db
        .from("interviews")
        .select("id")
        .eq("candidate_id", candidate.id);
      const ids = (interviewRows ?? []).map((r: { id: string }) => r.id);
      if (ids.length) {
        await db.from("interview_feedback").delete().in("interview_id", ids);
        await db.from("interviews").delete().eq("candidate_id", candidate.id);
      }
      await db.from("candidate_activity_log").delete().eq("candidate_id", candidate.id);
      const { error: err } = await db.from("candidates").delete().eq("id", candidate.id);
      if (err) throw err;
      toast.success(`${fullName(candidate)} removed`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["candidates"] }),
        queryClient.invalidateQueries({ queryKey: ["interviews"] }),
        queryClient.invalidateQueries({ queryKey: ["feedback"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
      onOpenChange(false);
      onDeleted();
    } catch (e) {
      toast.error(messageFrom(e, "Could not delete the candidate"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={!!candidate} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {candidate ? fullName(candidate) : ""}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the candidate along with all their interviews, feedback and
            activity history. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              remove();
            }}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? "Removing…" : "Remove candidate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
