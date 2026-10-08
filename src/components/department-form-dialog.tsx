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
import type { Department } from "@/lib/hiring";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{2,6}$/, "Use 2-6 uppercase letters or numbers"),
});

type FormState = z.infer<typeof schema>;

const EMPTY: FormState = { name: "", code: "" };

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function DepartmentFormDialog({
  open,
  onOpenChange,
  department,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: Department | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(department ? { name: department.name, code: department.code } : EMPTY);
  }, [open, department]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function save() {
    const normalized = { ...form, code: form.code.toUpperCase().replace(/[^A-Z0-9]/g, "") };
    const parsed = schema.safeParse(normalized);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (department) {
        const { error: updateDepartmentError } = await supabase
          .from("departments")
          .update(parsed.data)
          .eq("id", department.id);
        if (updateDepartmentError) throw updateDepartmentError;
        await supabase
          .from("jobs")
          .update({ department: parsed.data.name })
          .eq("department_id", department.id);
        toast.success(`${parsed.data.name} updated`);
      } else {
        const { error: insertDepartmentError } = await supabase
          .from("departments")
          .insert(parsed.data);
        if (insertDepartmentError) throw insertDepartmentError;
        toast.success(`${parsed.data.name} added`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["departments"] }),
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["candidates"] }),
      ]);
      onOpenChange(false);
    } catch (caught) {
      const msg = messageFrom(caught, "Could not save the department");
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
          <DialogTitle>{department ? "Edit department" : "Add department"}</DialogTitle>
          <DialogDescription>
            Department codes are used as the suffix in new job codes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="df-name">Name</Label>
            <Input id="df-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="df-code">Code</Label>
            <Input
              id="df-code"
              value={form.code}
              maxLength={6}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : department ? "Save changes" : "Add department"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDepartmentDialog({
  department,
  onOpenChange,
}: {
  department: Department | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!department) return;
    setDeleting(true);
    try {
      const { data: jobs } = await supabase
        .from("jobs")
        .select("id")
        .eq("department_id", department.id)
        .limit(1);
      if (jobs?.length) {
        throw new Error("This department has positions. Move or delete those positions first.");
      }
      const { error } = await supabase.from("departments").delete().eq("id", department.id);
      if (error) throw error;
      toast.success(`${department.name} deleted`);
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
      onOpenChange(false);
    } catch (caught) {
      toast.error(messageFrom(caught, "Could not delete the department"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={!!department} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {department?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Departments can only be deleted when no positions belong to them. This cannot be undone.
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
            {deleting ? "Deleting..." : "Delete department"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
