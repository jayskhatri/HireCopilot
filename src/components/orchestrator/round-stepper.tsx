import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ROUND_ORDER, STAGE_LABEL, type Round, type RoundProgression } from "@/lib/hiring";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import { useRef } from "react";

type RoundStepperProps = {
  progression: RoundProgression;
  value: Round;
  loading: boolean;
  onChange: (round: Round) => void;
};

export function RoundStepper({ progression, value, loading, onChange }: RoundStepperProps) {
  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});

  function moveTo(round: Round | undefined) {
    if (!round) return;
    onChange(round);
    buttonsRef.current[round]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (loading) return;
    const { selectable } = progression;
    const current = selectable.indexOf(value);

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveTo(selectable[Math.min(current + 1, selectable.length - 1)]);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveTo(selectable[Math.max(current - 1, 0)]);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(selectable[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(selectable[selectable.length - 1]);
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Interview round</p>
          {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div role="radiogroup" aria-label="Interview round" className="flex flex-wrap gap-2">
          {ROUND_ORDER.map((round, index) => {
            const locked = index < progression.floor;
            const selected = round === value;
            const completed = progression.completedRounds.includes(round);

            const button = (
              <button
                key={round}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={locked || loading}
                disabled={locked || loading}
                tabIndex={selected ? 0 : -1}
                ref={(node) => {
                  buttonsRef.current[round] = node;
                }}
                onClick={() => onChange(round)}
                onKeyDown={handleKeyDown}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted",
                  (locked || loading) &&
                    "cursor-not-allowed border-dashed bg-muted/40 text-muted-foreground opacity-60 hover:bg-muted/40",
                )}
              >
                {locked ? (
                  <Lock className="size-3.5" />
                ) : completed ? (
                  <CheckCircle2
                    className={cn(
                      "size-3.5",
                      selected ? "text-primary-foreground" : "text-success",
                    )}
                  />
                ) : null}
                {STAGE_LABEL[round]}
              </button>
            );

            if (!locked) return button;

            return (
              <Tooltip key={round}>
                <TooltipTrigger asChild>
                  <span className="inline-flex">{button}</span>
                </TooltipTrigger>
                <TooltipContent>
                  Already at {STAGE_LABEL[progression.defaultRound]}. Rounds before{" "}
                  {STAGE_LABEL[progression.defaultRound]} can&apos;t be scheduled.
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        {progression.locked.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Earlier rounds are locked because this candidate already reached{" "}
            {STAGE_LABEL[progression.defaultRound]}.
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
