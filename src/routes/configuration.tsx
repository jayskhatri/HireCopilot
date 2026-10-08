import { AppShell } from "@/components/app-shell";
import { DeleteDepartmentDialog, DepartmentFormDialog } from "@/components/department-form-dialog";
import {
    DeleteInterviewerDialog,
    InterviewerFormDialog,
} from "@/components/interviewer-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
    departmentsQuery,
    initials,
    interviewersQuery,
    jobsQuery,
    type Department,
    type Interviewer,
} from "@/lib/hiring";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Pencil, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/configuration")({
  head: () => ({
    meta: [
      { title: "Configuration — HireCopilot" },
      {
        name: "description",
        content:
          "Tune SLA thresholds, automation rules and the interviewer panel used by the AI orchestrator.",
      },
      { property: "og:title", content: "Configuration — HireCopilot" },
      {
        property: "og:description",
        content: "SLA thresholds, automation rules and interviewer panel setup.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConfigurationPage,
});

function ConfigurationPage() {
  const interviewers = useQuery(interviewersQuery);
  const departments = useQuery(departmentsQuery);
  const jobs = useQuery(jobsQuery);
  const [warnDays, setWarnDays] = useState(3);
  const [breachDays, setBreachDays] = useState(5);
  const [toggles, setToggles] = useState({
    autoSchedule: true,
    aiRisk: true,
    teamsReminders: true,
    weeklyDigest: false,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Interviewer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Interviewer | null>(null);
  const [departmentFormOpen, setDepartmentFormOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [deleteDepartmentTarget, setDeleteDepartmentTarget] = useState<Department | null>(null);

  return (
    <AppShell
      title="Configuration"
      subtitle="Rules the copilot and orchestrator follow on your behalf."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="gap-0 p-5">
          <p className="font-display text-base font-semibold">SLA thresholds</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="warn">Amber warning after (days)</Label>
              <Input
                id="warn"
                type="number"
                value={warnDays}
                onChange={(e) => setWarnDays(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="breach">Red breach after (days)</Label>
              <Input
                id="breach"
                type="number"
                value={breachDays}
                onChange={(e) => setBreachDays(Number(e.target.value))}
              />
            </div>
          </div>
          <Separator className="my-5" />
          <p className="font-display text-base font-semibold">Automation</p>
          <div className="mt-3 space-y-4">
            {(
              [
                ["autoSchedule", "Let the orchestrator auto-book the best slot"],
                ["aiRisk", "Run AI risk analysis on every feedback submission"],
                ["teamsReminders", "Send Teams reminders to candidate and panel"],
                ["weeklyDigest", "Email a weekly hiring digest to leadership"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <span className="text-sm">{label}</span>
                <Switch
                  checked={toggles[key]}
                  onCheckedChange={(v) => setToggles((prev) => ({ ...prev, [key]: v }))}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-base font-semibold">Departments</p>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => {
                setEditingDepartment(null);
                setDepartmentFormOpen(true);
              }}
            >
              <Building2 className="size-4" /> Add department
            </Button>
          </div>
          <div className="mt-3 divide-y divide-border">
            {(departments.data ?? []).map((department) => {
              const positionCount = (jobs.data ?? []).filter(
                (job) => job.department_id === department.id,
              ).length;
              return (
                <div key={department.id} className="group flex items-start gap-3 py-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                    {department.code}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{department.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {positionCount} {positionCount === 1 ? "position" : "positions"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setEditingDepartment(department);
                        setDepartmentFormOpen(true);
                      }}
                      aria-label={`Edit ${department.name}`}
                      className="rounded-md p-1.5 hover:bg-muted"
                    >
                      <Pencil className="size-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => setDeleteDepartmentTarget(department)}
                      aria-label={`Delete ${department.name}`}
                      className="rounded-md p-1.5 hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </button>
                  </div>
                </div>
              );
            })}
            {!(departments.data ?? []).length && (
              <p className="py-3 text-sm text-muted-foreground">No departments configured yet.</p>
            )}
          </div>
        </Card>

        <Card className="gap-0 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-base font-semibold">Interviewer panel</p>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <UserPlus className="size-4" /> Add interviewer
            </Button>
          </div>
          <div className="mt-3 divide-y divide-border">
            {(interviewers.data ?? []).map((i) => (
              <div key={i.id} className="group flex items-start gap-3 py-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                  {initials(i.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.title} · {i.timezone}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {i.skills.slice(0, 4).map((s) => (
                      <Badge key={s} variant="secondary" className="text-[11px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                  <button
                    onClick={() => {
                      setEditing(i);
                      setFormOpen(true);
                    }}
                    aria-label={`Edit ${i.name}`}
                    className="rounded-md p-1.5 hover:bg-muted"
                  >
                    <Pencil className="size-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(i)}
                    aria-label={`Remove ${i.name}`}
                    className="rounded-md p-1.5 hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <InterviewerFormDialog open={formOpen} onOpenChange={setFormOpen} interviewer={editing} />
      <DeleteInterviewerDialog
        interviewer={deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      />
      <DepartmentFormDialog
        open={departmentFormOpen}
        onOpenChange={setDepartmentFormOpen}
        department={editingDepartment}
      />
      <DeleteDepartmentDialog
        department={deleteDepartmentTarget}
        onOpenChange={(o) => !o && setDeleteDepartmentTarget(null)}
      />
    </AppShell>
  );
}
