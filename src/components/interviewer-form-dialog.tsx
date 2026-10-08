import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Interviewer } from "@/lib/hiring";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  title: z.string().trim().min(1, "Title is required"),
  timezone: z.string().trim().min(1, "Timezone is required"),
  skills: z.string(),
});

type FormState = z.infer<typeof schema>;

const EMPTY: FormState = {
  name: "",
  email: "",
  title: "Engineering Manager",
  timezone: "Asia/Kolkata",
  skills: "",
};

const db = supabase as any;

export function InterviewerFormDialog({
  open,
  onOpenChange,
  interviewer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interviewer: Interviewer | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      interviewer
        ? {
            name: interviewer.name,
            email: interviewer.email,
            title: interviewer.title,
            timezone: interviewer.timezone,
            skills: interviewer.skills.join(", "),
          }
        : EMPTY,
    );
  }, [open, interviewer]);

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
    const payload = {
      name: parsed.data.name,
      email: parsed.data.email,
      title: parsed.data.title,
      timezone: parsed.data.timezone,
      skills: parsed.data.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      if (interviewer) {
        const { error: err } = await db
          .from("interviewers")
          .update(payload)
          .eq("id", interviewer.id);
        if (err) throw err;
        toast.success(`${parsed.data.name} updated`);
      } else {
        const { error: err } = await db.from("interviewers").insert(payload);
        if (err) throw err;
        toast.success(`${parsed.data.name} added to the panel`);
      }
      await queryClient.invalidateQueries({ queryKey: ["interviewers"] });
      onOpenChange(false);
    } catch (e: any) {
      const msg =
        typeof e?.message === "string" && e.message.includes("duplicate")
          ? "An interviewer with this email already exists"
          : (e?.message ?? "Something went wrong");
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{interviewer ? "Edit interviewer" : "Add interviewer"}</DialogTitle>
          <DialogDescription>
            Panel skills drive the orchestrator's interviewer matching.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="if-name">Name</Label>
            <Input
              id="if-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="if-email">Email</Label>
            <Input
              id="if-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="if-title">Title</Label>
              <Input
                id="if-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="if-tz">Timezone</Label>
              <Input
                id="if-tz"
                value={form.timezone}
                onChange={(e) => set("timezone", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="if-skills">Skills (comma separated)</Label>
            <Input
              id="if-skills"
              placeholder="React, System Design, Node.js"
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
            {saving ? "Saving…" : interviewer ? "Save changes" : "Add interviewer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteInterviewerDialog({
  interviewer,
  onOpenChange,
}: {
  interviewer: Interviewer | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!interviewer) return;
    setDeleting(true);
    try {
      await db.from("interviews").update({ interviewer_id: null }).eq("interviewer_id", interviewer.id);
      const { error: err } = await db.from("interviewers").delete().eq("id", interviewer.id);
      if (err) throw err;
      toast.success(`${interviewer.name} removed from the panel`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["interviewers"] }),
        queryClient.invalidateQueries({ queryKey: ["interviews"] }),
      ]);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove the interviewer");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={!!interviewer} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {interviewer?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Interviews already booked with them stay on the schedule but will need a new panel
            member assigned. This cannot be undone.
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
            {deleting ? "Removing…" : "Remove interviewer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
