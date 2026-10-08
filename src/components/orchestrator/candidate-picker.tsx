import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
    daysInStage,
    fullName,
    initials,
    jobLabel,
    matchesCandidateSearch,
    STAGE_LABEL,
    type Candidate,
} from "@/lib/hiring";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type CandidatePickerProps = {
  candidates: Candidate[];
  loading: boolean;
  hiddenExcludedCount: number;
  selectedId?: string | undefined;
  autoFocus: boolean;
  onSelect: (candidateId: string) => void;
};

export function CandidatePicker({
  candidates,
  loading,
  hiddenExcludedCount,
  selectedId,
  autoFocus,
  onSelect,
}: CandidatePickerProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rowsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const listboxId = useId();

  const filtered = useMemo(
    () => candidates.filter((candidate) => matchesCandidateSearch(candidate, query)),
    [candidates, query],
  );

  const rowId = (candidateId: string) => `${listboxId}-option-${candidateId}`;
  const activeCandidate = filtered[activeIndex];

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // The candidates prop can shrink underneath a stale index and drop the active descendant.
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  useEffect(() => {
    const active = filtered[activeIndex];
    if (active) rowsRef.current[active.id]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filtered]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      const active = filtered[activeIndex];
      if (active) {
        event.preventDefault();
        onSelect(active.id);
      }
    } else if (event.key === "Escape") {
      setQuery("");
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search candidates by name, email or role"
          aria-label="Search candidates"
          role="combobox"
          aria-expanded={!loading && filtered.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          {...(activeCandidate ? { "aria-activedescendant": rowId(activeCandidate.id) } : {})}
          className="pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length ? (
        <ScrollArea className="h-64 rounded-lg border border-border">
          <div
            id={listboxId}
            className="divide-y divide-border"
            role="listbox"
            aria-label="Candidates"
          >
            {filtered.map((candidate, index) => {
              const days = daysInStage(candidate);
              return (
                <button
                  key={candidate.id}
                  id={rowId(candidate.id)}
                  type="button"
                  role="option"
                  aria-selected={candidate.id === selectedId}
                  ref={(node) => {
                    rowsRef.current[candidate.id] = node;
                  }}
                  onClick={() => onSelect(candidate.id)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex w-full items-center gap-3 p-3 text-left transition-colors",
                    index === activeIndex ? "bg-muted/60" : "hover:bg-muted/40",
                    candidate.id === selectedId && "bg-primary/5",
                  )}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(fullName(candidate))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{fullName(candidate)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {candidate.jobs ? jobLabel(candidate.jobs) : "—"}
                    </p>
                  </div>
                  <Badge variant="secondary">{STAGE_LABEL[candidate.current_stage]}</Badge>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    {days}d in stage
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {query.trim()
              ? `No active candidates match "${query}"`
              : "No active candidates to schedule."}
          </p>
          {hiddenExcludedCount > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Rejected and offered candidates are excluded from scheduling.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
