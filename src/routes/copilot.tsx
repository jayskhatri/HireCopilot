import { AppShell } from "@/components/app-shell";
import { CopilotChat } from "@/components/copilot-panel";
import { Card } from "@/components/ui/card";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, Database, Sparkles, Workflow } from "lucide-react";

export const Route = createFileRoute("/copilot")({
  head: () => ({
    meta: [
      { title: "Teams Copilot — HireCopilot" },
      {
        name: "description",
        content:
          "Ask the hiring copilot about any candidate; it queries the live database with AI tool calling.",
      },
      { property: "og:title", content: "Teams Copilot — HireCopilot" },
      {
        property: "og:description",
        content: "Conversational hiring assistant wired to live recruiting data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CopilotPage,
});

function CopilotPage() {
  return (
    <AppShell
      title="Copilot (Teams)"
      subtitle="A recruiter assistant that reads your live hiring database before it answers."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="h-[calc(100dvh-11rem)] min-h-96 max-h-[52rem] gap-0 overflow-hidden p-0">
          <CopilotChat className="h-full" />
        </Card>

        <div className="space-y-4">
          <Card className="gap-0 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" /> How it works
            </p>
            <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Bot className="mt-0.5 size-4 shrink-0 text-primary" /> Your question goes to the AI
                model with a set of database tools.
              </li>
              <li className="flex gap-2">
                <Database className="mt-0.5 size-4 shrink-0 text-primary" /> The model calls those
                tools, which run real SQL against candidates, interviews and activity history.
              </li>
              <li className="flex gap-2">
                <Workflow className="mt-0.5 size-4 shrink-0 text-primary" /> Results are fed back in
                and the model writes a recruiter-ready status update.
              </li>
            </ol>
          </Card>

          <Card className="gap-0 p-5">
            <p className="text-sm font-semibold">Available tools</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <code className="text-xs">getCandidateStatus(name)</code> — stage, days in stage,
                interviews and activity log
              </li>
              <li>
                <code className="text-xs">getStuckCandidates(days)</code> — SLA breaches beyond N
                days
              </li>
              <li>
                <code className="text-xs">getPipelineSummary()</code> — stage counts, blocked roles
              </li>
              <li>
                <code className="text-xs">getTodaysInterviews()</code> — today's schedule
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
