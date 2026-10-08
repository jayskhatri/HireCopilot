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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { departmentsQuery, jobLabel, type Job, type PositionStatus } from "@/lib/hiring";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  department_id: z.string().trim().min(1, "Department is required"),
  description: z.string().trim(),
  location: z.string().trim().min(1, "Location is required"),
  required_skills: z.string(),
  status: z.enum(["OPEN", "CLOSED"]),
});

type FormState = z.infer<typeof schema>;

const EMPTY: FormState = {
  title: "",
  department_id: "",
  description: "",
  location: "Bengaluru, IN",
  required_skills: "",
  status: "OPEN",
};

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function invalidatePositionQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["jobs"] }),
    queryClient.invalidateQueries({ queryKey: ["candidates"] }),
    queryClient.invalidateQueries({ queryKey: ["interviews"] }),
  ]);
}

export function PositionFormDialog({
  open,
  onOpenChange,
  job,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
}) {
  const departments = useQuery(departmentsQuery);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      job
        ? {
            title: job.title,
            department_id: job.department_id,
            description: job.description ?? "",
            location: job.location,
            required_skills: job.required_skills.join(", "),
            status: job.status,
          }
        : { ...EMPTY, department_id: departments.data?.[0]?.id ?? "" },
    );
  }, [open, job, departments.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function save() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    const department = departments.data?.find((d) => d.id === parsed.data.department_id);
    if (!department) {
      setError("Choose a valid department");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title: parsed.data.title,
      department_id: department.id,
      department: department.name,
      description: parsed.data.description || null,
      location: parsed.data.location,
      required_skills: parsed.data.required_skills
        .split(",")
        .map((skill) => skill.trim())
        .filter(Boolean),
      status: parsed.data.status,
    };
    try {
      if (job) {
        const { error: updateError } = await supabase.from("jobs").update(payload).eq("id", job.id);
        if (updateError) throw updateError;
        toast.success(`${parsed.data.title} updated`);
      } else {
        const { error: insertError } = await supabase.rpc("create_job_with_code", {
          title: payload.title,
          department_id: payload.department_id,
          description: payload.description,
          location: payload.location,
          required_skills: payload.required_skills,
          status: payload.status,
        });
        if (insertError) throw insertError;
        toast.success(`${parsed.data.title} opened`);
      }
      await invalidatePositionQueries(queryClient);
      onOpenChange(false);
    } catch (caught) {
      const msg = messageFrom(caught, "Could not save the position");
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
          <DialogTitle>{job ? "Edit position" : "Open position"}</DialogTitle>
          <DialogDescription>
            {job
              ? "Update the role without changing its job code."
              : "Create a recruiter-facing job code for a new role."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pf-title">Title</Label>
            <Input
              id="pf-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-department">Department</Label>
            <select
              id="pf-department"
              value={form.department_id}
              onChange={(e) => set("department_id", e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Choose department</option>
              {(departments.data ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name} ({department.code})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-status">Status</Label>
            <select
              id="pf-status"
              value={form.status}
              onChange={(e) => set("status", e.target.value as PositionStatus)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pf-location">Location</Label>
            <Input
              id="pf-location"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pf-skills">Required skills (comma separated)</Label>
            <Input
              id="pf-skills"
              placeholder="React, Node.js, PostgreSQL"
              value={form.required_skills}
              onChange={(e) => set("required_skills", e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pf-description">Description</Label>
            <Textarea
              id="pf-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : job ? "Save changes" : "Open position"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PositionStatusDialog({
  job,
  status,
  onOpenChange,
}: {
  job: Job | null;
  status: PositionStatus;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const action = status === "CLOSED" ? "Close" : "Reopen";

  async function updateStatus() {
    if (!job) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("jobs").update({ status }).eq("id", job.id);
      if (error) throw error;
      toast.success(`${jobLabel(job)} ${status === "CLOSED" ? "closed" : "reopened"}`);
      await invalidatePositionQueries(queryClient);
      onOpenChange(false);
    } catch (caught) {
      toast.error(messageFrom(caught, "Could not update the position"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={!!job} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {action} {job ? jobLabel(job) : "position"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {status === "CLOSED"
              ? "Closed positions stay visible for assigned candidates and reporting, but recruiters cannot treat them as active openings."
              : "Reopened positions return to the active openings list and can receive new candidates."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              updateStatus();
            }}
            disabled={saving}
          >
            {saving ? "Saving..." : action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeletePositionDialog({
  job,
  onOpenChange,
}: {
  job: Job | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!job) return;
    setDeleting(true);
    try {
      const [{ data: candidates }, { data: interviews }] = await Promise.all([
        supabase.from("candidates").select("id").eq("job_id", job.id).limit(1),
        supabase.from("interviews").select("id").eq("job_id", job.id).limit(1),
      ]);
      if (candidates?.length || interviews?.length) {
        throw new Error(
          "This position has candidates or interviews. Close it instead of deleting it.",
        );
      }
      const { error } = await supabase.from("jobs").delete().eq("id", job.id);
      if (error) throw error;
      toast.success(`${jobLabel(job)} deleted`);
      await invalidatePositionQueries(queryClient);
      onOpenChange(false);
    } catch (caught) {
      toast.error(messageFrom(caught, "Could not delete the position"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={!!job} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {job ? jobLabel(job) : "position"}?</AlertDialogTitle>
          <AlertDialogDescription>
            Positions can only be deleted before candidates or interviews are linked to them. This
            cannot be undone.
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
            {deleting ? "Deleting..." : "Delete position"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
