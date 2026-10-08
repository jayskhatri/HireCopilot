import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { askCopilot, type CopilotTurn } from "@/lib/copilot.functions";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Send, Sparkles, User, Wrench } from "lucide-react";
import { useState } from "react";

const CHIPS = [
  "Where is Rahul Sharma's application?",
  "Show candidates stuck for more than 3 days",
  "Which positions are blocked?",
  "What interviews are happening today?",
];

type Message = CopilotTurn & { tools?: string[] };

function renderMarkdown(text: string) {
  return text.split("\n").map((line, i) => {
    const bold = (s: string) =>
      s
        .split(/(\*\*[^*]+\*\*)/g)
        .map((part, j) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={j}>{part.slice(2, -2)}</strong>
          ) : (
            <span key={j}>{part}</span>
          ),
        );
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-2" />;
    if (/^([-*•]|\d+\.)\s/.test(trimmed)) {
      return (
        <div key={i} className="flex gap-2">
          <span className="text-primary">•</span>
          <span>{bold(trimmed.replace(/^([-*•]|\d+\.)\s/, ""))}</span>
        </div>
      );
    }
    return <p key={i}>{bold(trimmed)}</p>;
  });
}

export function CopilotChat({ className }: { className?: string }) {
  const ask = useServerFn(askCopilot);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm HireCopilot. I read your live hiring database, so ask me about any candidate, SLA breach or blocked role.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    const next: Message[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const result = await ask({
        data: { messages: next.map(({ role, content }) => ({ role, content })) },
      });
      setMessages([...next, { role: "assistant", content: result.reply, tools: result.toolsUsed }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessages([
        ...next,
        { role: "assistant", content: `I hit an error reading the database: ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", className)}>
      <div className="flex shrink-0 items-center gap-3 bg-teams px-4 py-3 text-teams-foreground">
        <div className="flex size-9 items-center justify-center rounded-lg bg-white/15">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">HireCopilot</p>
          <p className="truncate text-xs opacity-80">Microsoft Teams · connected to live data</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}>
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full",
                m.role === "user"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-teams/10 text-teams",
              )}
            >
              {m.role === "user" ? <User className="size-4" /> : <Sparkles className="size-4" />}
            </div>
            <div
              className={cn(
                "max-w-[85%] space-y-1 break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              {renderMarkdown(m.content)}
              {!!m.tools?.length && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {[...new Set(m.tools)].map((t) => (
                    <Badge key={t} variant="outline" className="gap-1 text-[10px]">
                      <Wrench className="size-3" /> {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Querying the hiring database…
          </div>
        )}
      </div>

      <div className="max-h-[45dvh] shrink-0 overflow-y-auto border-t border-border p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => send(chip)}
              className="rounded-full border border-teams/30 bg-teams/5 px-3 py-1 text-xs text-teams transition-colors hover:bg-teams/10"
            >
              {chip}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a candidate, role or SLA breach…"
          />
          <Button
            type="submit"
            disabled={loading}
            className="bg-teams text-teams-foreground hover:bg-teams/90"
          >
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

export function CopilotPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-hidden p-0 sm:max-w-md">
        <SheetTitle className="sr-only">HireCopilot chat</SheetTitle>
        <CopilotChat className="h-full" />
      </SheetContent>
    </Sheet>
  );
}
