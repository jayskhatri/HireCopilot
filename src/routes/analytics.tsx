import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { STAGES, STAGE_LABEL, candidatesQuery, daysInStage, interviewsQuery } from "@/lib/hiring";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, UsersRound } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Hiring Analytics — HireCopilot" },
      {
        name: "description",
        content:
          "Funnel conversion, source mix and interview throughput across the hiring pipeline.",
      },
      { property: "og:title", content: "Hiring Analytics — HireCopilot" },
      {
        property: "og:description",
        content: "Funnel, source mix and interview throughput analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

const COLORS = ["#2454D8", "#3EB5D8", "#A8D5E6", "#7055D9", "#59A5D3"];
const FUNNEL_COLORS = ["#2454D8", "#3EB5D8", "#A8D5E6", "#7055D9", "#40A87A", "#D9536F"];

function AnalyticsPage() {
  const candidates = useQuery(candidatesQuery);
  const interviews = useQuery(interviewsQuery);
  const [breakdown, setBreakdown] = useState<"sources" | "stages">("sources");
  const [showAllSources, setShowAllSources] = useState(false);
  const list = candidates.data ?? [];

  const funnel = STAGES.map((s) => ({
    stage: STAGE_LABEL[s],
    count: list.filter((c) => c.current_stage === s).length,
  }));

  const sources = Object.entries(
    list.reduce<Record<string, number>>((acc, c) => {
      acc[c.source] = (acc[c.source] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  const stageSources = STAGES.map((stage) => ({
    name: STAGE_LABEL[stage],
    value: list.filter((candidate) => candidate.current_stage === stage).length,
  })).filter((item) => item.value > 0);
  const chartItems = breakdown === "sources" ? sources : stageSources;
  const visibleItems =
    breakdown === "sources" && !showAllSources ? chartItems.slice(0, 5) : chartItems;

  const avgDays = list.length
    ? Math.round(list.reduce((sum, c) => sum + daysInStage(c), 0) / list.length)
    : 0;

  const stats = [
    { label: "Candidates in play", value: String(list.length) },
    { label: "Interviews scheduled", value: String((interviews.data ?? []).length) },
    { label: "Avg. days in stage", value: `${avgDays}d` },
    {
      label: "Offer conversion",
      value: `${list.length ? Math.round((list.filter((c) => c.current_stage === "OFFER").length / list.length) * 100) : 0}%`,
    },
  ];

  return (
    <AppShell
      title="Analytics"
      subtitle="Where candidates move fast, and where the pipeline leaks."
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="min-w-0 gap-1 p-2.5 sm:p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
              {s.label}
            </p>
            <p className="font-display text-lg font-semibold tabular-nums sm:text-xl">
              {s.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card className="gap-0 p-4 sm:p-5">
          <p className="font-display text-base font-semibold">Pipeline funnel</p>
          <div className="mt-4 h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="stage" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                <Tooltip cursor={{ opacity: 0.1 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {funnel.map((item, index) => (
                    <Cell key={item.stage} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="gap-0 overflow-hidden p-4 sm:p-5">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UsersRound className="size-5" />
            </div>
            <div>
              <p className="font-display text-xl font-bold tabular-nums">
                {list.length} candidates
              </p>
              <p className="text-sm text-muted-foreground">Total candidates tracked</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-6 pt-6 lg:flex-row lg:justify-center lg:gap-12">
            <div className="relative h-60 w-full max-w-[380px] shrink-0 sm:h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartItems}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={3}
                    cornerRadius={10}
                    stroke="hsl(var(--card))"
                    strokeWidth={5}
                  >
                    {chartItems.map((item, index) => (
                      <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} candidates`, "Count"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
                  {list.length}
                </span>
                <span className="mt-1 text-xs font-semibold text-muted-foreground sm:text-sm">
                  candidates
                  <br />
                  {breakdown === "sources" ? "by source" : "by stage"}
                </span>
              </div>
            </div>

            <div className="w-full max-w-[460px]">
              <div className="mb-5 inline-flex max-w-full overflow-x-auto rounded-full bg-muted p-1">
                {(["sources", "stages"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setBreakdown(item);
                      setShowAllSources(false);
                    }}
                    className={`rounded-full px-5 py-2 text-sm font-semibold capitalize transition-colors ${
                      breakdown === item
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                {visibleItems.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between gap-4 py-2.5">
                    <span className="flex min-w-0 items-center gap-3 font-semibold">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                      {item.value} {item.value === 1 ? "candidate" : "candidates"}
                    </span>
                  </div>
                ))}
                {!visibleItems.length && (
                  <p className="py-5 text-sm text-muted-foreground">
                    No candidate data available yet.
                  </p>
                )}
              </div>

              {breakdown === "sources" && chartItems.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAllSources((shown) => !shown)}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showAllSources ? "Show fewer sources" : "See all sources"}
                  <ChevronDown
                    className={`size-4 transition-transform ${showAllSources ? "rotate-180" : ""}`}
                  />
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
