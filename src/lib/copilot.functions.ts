import { createServerFn } from "@tanstack/react-start";
import { callResponses, type ResponsesTool } from "./ai.server";

export type CopilotTurn = { role: "user" | "assistant"; content: string };

const tools: ResponsesTool[] = [
  {
    type: "function",
    name: "getCandidateStatus",
    description:
      "Look up one candidate by full or partial name. Returns stage, days in stage, role, interviews and recent activity log entries.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        candidateName: { type: "string", description: "Full or partial candidate name" },
      },
      required: ["candidateName"],
    },
  },
  {
    type: "function",
    name: "getStuckCandidates",
    description:
      "List active candidates whose stage has not changed for more than N days (SLA breach). Excludes OFFER and REJECTED.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { days: { type: "number", description: "SLA threshold in days, e.g. 3" } },
      required: ["days"],
    },
  },
  {
    type: "function",
    name: "getPipelineSummary",
    description:
      "Counts of candidates per stage, open positions, interviews scheduled today and blocked positions.",
    strict: true,
    parameters: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: "function",
    name: "getTodaysInterviews",
    description: "Today's interview schedule with candidate, interviewer, round and time.",
    strict: true,
    parameters: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
];

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

async function runTool(name: string, args: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (name === "getCandidateStatus") {
    const term = String(args?.candidateName ?? "").trim();
    const parts = term.split(/\s+/).filter(Boolean);
    const { data: candidates } = await supabaseAdmin
      .from("candidates")
      .select("*, jobs(title, department)")
      .or(parts.map((p) => `first_name.ilike.%${p}%,last_name.ilike.%${p}%`).join(","))
      .limit(5);

    if (!candidates?.length) return { found: false, message: `No candidate matching "${term}".` };

    const results = [];
    for (const c of candidates as any[]) {
      const { data: interviews } = await supabaseAdmin
        .from("interviews")
        .select("stage, scheduled_start, status, interviewers(name)")
        .eq("candidate_id", c.id)
        .order("scheduled_start", { ascending: false });
      const { data: activity } = await supabaseAdmin
        .from("candidate_activity_log")
        .select("action_type, details, created_at")
        .eq("candidate_id", c.id)
        .order("created_at", { ascending: false })
        .limit(6);
      results.push({
        name: `${c.first_name} ${c.last_name}`,
        email: c.email,
        role: c.jobs?.title ?? "Unassigned",
        current_stage: c.current_stage,
        days_in_stage: daysSince(c.status_updated_at),
        experience_years: c.experience_years,
        skills: c.skills,
        interviews,
        recent_activity: activity,
      });
    }
    return { found: true, candidates: results };
  }

  if (name === "getStuckCandidates") {
    const days = Number(args?.days ?? 3);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await supabaseAdmin
      .from("candidates")
      .select("first_name, last_name, current_stage, status_updated_at, jobs(title)")
      .lt("status_updated_at", cutoff)
      .not("current_stage", "in", "(OFFER,REJECTED)")
      .order("status_updated_at", { ascending: true });
    return {
      threshold_days: days,
      count: data?.length ?? 0,
      candidates: (data as any[] | null)?.map((c) => ({
        name: `${c.first_name} ${c.last_name}`,
        stage: c.current_stage,
        role: c.jobs?.title ?? "Unassigned",
        days_in_stage: daysSince(c.status_updated_at),
      })),
    };
  }

  if (name === "getPipelineSummary") {
    const { data: candidates } = await supabaseAdmin
      .from("candidates")
      .select("current_stage, status_updated_at, jobs(title)");
    const { data: jobs } = await supabaseAdmin.from("jobs").select("title, status, open_since");
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86400000);
    const { data: todays } = await supabaseAdmin
      .from("interviews")
      .select("id")
      .eq("status", "SCHEDULED")
      .gte("scheduled_start", start.toISOString())
      .lt("scheduled_start", end.toISOString());

    const byStage: Record<string, number> = {};
    for (const c of (candidates as any[]) ?? []) {
      byStage[c.current_stage] = (byStage[c.current_stage] ?? 0) + 1;
    }
    const blocked = ((jobs as any[]) ?? [])
      .filter((j) => daysSince(j.open_since) > 25 && j.status === "OPEN")
      .map((j) => ({ title: j.title, days_open: daysSince(j.open_since) }));

    return {
      candidates_by_stage: byStage,
      open_positions: ((jobs as any[]) ?? []).filter((j) => j.status === "OPEN").length,
      interviews_today: todays?.length ?? 0,
      blocked_positions: blocked,
    };
  }

  if (name === "getTodaysInterviews") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86400000);
    const { data } = await supabaseAdmin
      .from("interviews")
      .select(
        "stage, scheduled_start, status, candidates(first_name, last_name), interviewers(name)",
      )
      .eq("status", "SCHEDULED")
      .gte("scheduled_start", start.toISOString())
      .lt("scheduled_start", end.toISOString())
      .order("scheduled_start");
    return {
      interviews: (data as any[] | null)?.map((i) => ({
        candidate: `${i.candidates?.first_name} ${i.candidates?.last_name}`,
        interviewer: i.interviewers?.name,
        round: i.stage,
        time: i.scheduled_start,
        status: i.status,
      })),
    };
  }

  return { error: `Unknown tool ${name}` };
}

const SYSTEM = `You are HireCopilot, an autonomous hiring operations assistant embedded in Microsoft Teams for a recruiting team.
Always call the available tools to read live data from the hiring database before answering — never invent candidates, stages, dates or counts.
Answer like a senior recruiting ops partner: lead with the direct answer, then 2-5 short markdown bullets with the concrete facts (stage, days in stage, interviewer, next action).
Flag SLA breaches (>3 days in stage) explicitly and always end with a recommended next action. Keep responses under 160 words.`;

export const askCopilot = createServerFn({ method: "POST" })
  .inputValidator((data: { messages: CopilotTurn[] }) => data)
  .handler(async ({ data }) => {
    const input: any[] = data.messages
      .slice(-12)
      .map((m) =>
        m.role === "user"
          ? { role: "user", content: [{ type: "input_text", text: m.content }] }
          : { role: "assistant", content: [{ type: "output_text", text: m.content }] },
      );

    const toolsUsed: string[] = [];

    for (let step = 0; step < 5; step++) {
      const result = await callResponses({
        instructions: SYSTEM,
        input,
        tools,
        store: false,
        reasoning: { effort: "low" },
      });

      const calls = result.output.filter((o: any) => o.type === "function_call");
      if (!calls.length) {
        return {
          reply: result.text || "I could not find anything for that request.",
          toolsUsed,
        };
      }

      for (const call of calls as any[]) {
        input.push(call);
      }
      for (const call of calls as any[]) {
        let parsed: any = {};
        try {
          parsed = call.arguments ? JSON.parse(call.arguments) : {};
        } catch {
          parsed = {};
        }
        toolsUsed.push(call.name);
        const output = await runTool(call.name, parsed);
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(output),
        });
      }
    }

    return {
      reply: "I ran out of steps looking that up. Please try a narrower question.",
      toolsUsed,
    };
  });
