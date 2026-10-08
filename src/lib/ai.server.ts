/**
 * Thin, dependency-free client for the Lovable AI Gateway Responses API.
 * Always streams (required for reasoning models) and returns the final text
 * plus the raw output items so tool calls can be rounded-tripped.
 */

export type ResponsesTool = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
};

export type ResponsesResult = {
  text: string;
  output: Array<Record<string, unknown>>;
};

export const AI_MODEL = "openai/gpt-6-astra";

export async function callResponses(body: Record<string, unknown>): Promise<ResponsesResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({ model: AI_MODEL, stream: true, ...body }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted for this workspace.");
    throw new Error(`AI gateway error ${res.status}: ${detail.slice(0, 400)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let output: Array<Record<string, unknown>> = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let evt: any;
      try {
        evt = JSON.parse(payload);
      } catch {
        continue;
      }
      if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
        text += evt.delta;
      } else if (evt.type === "response.completed" && evt.response) {
        output = (evt.response.output ?? []) as Array<Record<string, unknown>>;
        if (!text && typeof evt.response.output_text === "string") text = evt.response.output_text;
      } else if (evt.type === "error") {
        throw new Error(evt.error?.message ?? "AI gateway stream error");
      }
    }
  }

  if (!text) {
    for (const item of output) {
      if ((item as any).type === "message") {
        for (const part of ((item as any).content ?? []) as any[]) {
          if (part?.type === "output_text" && typeof part.text === "string") text += part.text;
        }
      }
    }
  }

  return { text, output };
}
