import { createServerFn } from "@tanstack/react-start";
import { callResponses } from "./ai.server";
import { getAppSettings } from "./app-settings.server";

export type RubricAnswer = { question: string; score: number };

export type FeedbackInput = {
  interviewId: string;
  candidateName: string;
  role: string;
  round: string;
  rubric: RubricAnswer[];
  comments: string;
};

export type FeedbackAnalysis = {
  overall_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  risk_rationale: string;
  recommendation: "SELECT" | "REJECT" | "BORDERLINE";
  sentiment: string;
  strengths: string[];
  concerns: string[];
};

function deterministic(input: FeedbackInput): FeedbackAnalysis {
  const scores = input.rubric.map((r) => r.score);
  const avg = scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1);
  const variance =
    scores.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(scores.length, 1);
  const risk: FeedbackAnalysis["risk_level"] =
    avg < 6 || variance > 6 ? "HIGH" : avg < 7 || variance > 3 ? "MEDIUM" : "LOW";
  return {
    overall_score: Number(avg.toFixed(1)),
    risk_level: risk,
    risk_rationale:
      risk === "HIGH"
        ? `Average score ${avg.toFixed(1)} with score variance ${variance.toFixed(1)} across the rubric indicates inconsistent performance.`
        : `Average score ${avg.toFixed(1)} with variance ${variance.toFixed(1)}; no blocking signals detected in the rubric.`,
    recommendation: avg >= 7.5 ? "SELECT" : avg < 6 ? "REJECT" : "BORDERLINE",
    sentiment: "Computed locally from rubric scores.",
    strengths: [],
    concerns: [],
  };
}

export type FeedbackAnalysisResult = FeedbackAnalysis & {
  aiGenerated: boolean;
  aiDisabled?: boolean;
};

export const analyzeFeedback = createServerFn({ method: "POST" })
  .inputValidator((data: FeedbackInput) => data)
  .handler(async ({ data }): Promise<FeedbackAnalysisResult> => {
    const fallback = deterministic(data);

    const { aiRiskAnalysis } = await getAppSettings();
    if (!aiRiskAnalysis) {
      return { ...fallback, aiGenerated: false, aiDisabled: true };
    }

    const prompt = `Evaluate this interview feedback and return json.

Candidate: ${data.candidateName}
Role: ${data.role}
Round: ${data.round}

Rubric scores (1-10):
${data.rubric.map((r, i) => `${i + 1}. ${r.question}: ${r.score}`).join("\n")}

Interviewer written notes:
"""${data.comments || "(no written notes provided)"}"""

Rules:
- overall_score is the average of the rubric scores, adjusted by at most 0.5 if the written notes clearly contradict the numbers.
- risk_level is HIGH when the average is below 6.0, when score variance across questions is large, or when the notes describe red flags that the interviewer did not resolve.
- risk_rationale must name the concrete signal (score, variance, or quoted concern).
- sentiment describes whether written sentiment aligns with the numeric scores.`;

    try {
      const result = await callResponses({
        instructions:
          "You are a hiring quality and risk analyst. Be strict, concise and evidence-based.",
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        store: false,
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: "feedback_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                overall_score: { type: "number" },
                risk_level: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
                risk_rationale: { type: "string" },
                recommendation: { type: "string", enum: ["SELECT", "REJECT", "BORDERLINE"] },
                sentiment: { type: "string" },
                strengths: { type: "array", items: { type: "string" } },
                concerns: { type: "array", items: { type: "string" } },
              },
              required: [
                "overall_score",
                "risk_level",
                "risk_rationale",
                "recommendation",
                "sentiment",
                "strengths",
                "concerns",
              ],
            },
          },
        },
      });

      const parsed = JSON.parse(result.text) as FeedbackAnalysis;
      // Safety net: the hard rule always wins.
      if (parsed.overall_score < 6) parsed.risk_level = "HIGH";
      return { ...parsed, aiGenerated: true };
    } catch (error) {
      console.error("analyzeFeedback fell back to deterministic scoring", error);
      return { ...fallback, aiGenerated: false };
    }
  });
