import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    type CandidateAdvancedFilterOptions,
    type CandidateAdvancedFilters,
    type CandidateFilterOption,
    type CandidateSlaBucket,
    type CandidateSort,
} from "@/lib/hiring";
import { Check, ChevronsUpDown } from "lucide-react";
import { useId } from "react";

type CandidateFilterErrors = ReturnType<
  typeof import("@/lib/hiring").validateCandidateAdvancedFilters
>;

type CandidateFiltersSheetProps = {
  open: boolean;
  draft: CandidateAdvancedFilters;
  options: CandidateAdvancedFilterOptions;
  errors: CandidateFilterErrors;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: CandidateAdvancedFilters) => void;
  onClear: () => void;
  onApply: () => void;
};

type MultiSelectProps = {
  label: string;
  placeholder: string;
  options: CandidateFilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
};

function MultiSelect({ label, placeholder, options, selected, onChange }: MultiSelectProps) {
  const triggerId = useId();
  const selectedLabels = options
    .filter((option) => selected.includes(option.value))
    .map((option) => option.label);

  return (
    <div className="space-y-2">
      <Label htmlFor={triggerId}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={triggerId}
            type="button"
            variant="outline"
            role="combobox"
            className="h-auto min-h-9 w-full justify-between gap-2 px-3 font-normal"
          >
            <span className="truncate text-left">
              {selectedLabels.length
                ? selectedLabels.length === 1
                  ? selectedLabels[0]
                  : `${selectedLabels.length} selected`
                : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
          <Command>
            <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />
            <CommandList>
              <CommandEmpty>No options found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const checked = selected.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={`${option.label} ${option.value}`}
                      onSelect={() =>
                        onChange(
                          checked
                            ? selected.filter((value) => value !== option.value)
                            : [...selected, option.value],
                        )
                      }
                    >
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {checked && <Check className="size-4 text-primary" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function CandidateFiltersSheet({
  open,
  draft,
  options,
  errors,
  onOpenChange,
  onDraftChange,
  onClear,
  onApply,
}: CandidateFiltersSheetProps) {
  const update = <Key extends keyof CandidateAdvancedFilters>(
    key: Key,
    value: CandidateAdvancedFilters[Key],
  ) => onDraftChange({ ...draft, [key]: value });
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[28rem]"
      >
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 text-left">
          <SheetTitle>More filters</SheetTitle>
          <SheetDescription>Refine candidates and choose how results are ordered.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <MultiSelect
            label="Positions"
            placeholder="All positions"
            options={options.positions}
            selected={draft.positionIds}
            onChange={(value) => update("positionIds", value)}
          />
          <MultiSelect
            label="Departments"
            placeholder="All departments"
            options={options.departments}
            selected={draft.departmentIds}
            onChange={(value) => update("departmentIds", value)}
          />
          <MultiSelect
            label="Locations"
            placeholder="All locations"
            options={options.locations}
            selected={draft.locations}
            onChange={(value) => update("locations", value)}
          />
          <MultiSelect
            label="Sources"
            placeholder="All sources"
            options={options.sources}
            selected={draft.sources}
            onChange={(value) => update("sources", value)}
          />
          <MultiSelect
            label="Skills"
            placeholder="All skills"
            options={options.skills}
            selected={draft.skills}
            onChange={(value) => update("skills", value)}
          />
          <MultiSelect
            label="SLA status"
            placeholder="All SLA statuses"
            options={options.slaBuckets}
            selected={draft.slaBuckets}
            onChange={(value) => update("slaBuckets", value as CandidateSlaBucket[])}
          />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Experience (years)</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="candidate-experience-min" className="text-xs text-muted-foreground">
                  Minimum
                </Label>
                <Input
                  id="candidate-experience-min"
                  type="number"
                  min="0"
                  max="50"
                  step="any"
                  value={draft.experienceMin}
                  aria-invalid={!!errors.experienceMin || !!errors.experienceRange}
                  onChange={(event) => update("experienceMin", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="candidate-experience-max" className="text-xs text-muted-foreground">
                  Maximum
                </Label>
                <Input
                  id="candidate-experience-max"
                  type="number"
                  min="0"
                  max="50"
                  step="any"
                  value={draft.experienceMax}
                  aria-invalid={!!errors.experienceMax || !!errors.experienceRange}
                  onChange={(event) => update("experienceMax", event.target.value)}
                />
              </div>
            </div>
            {(errors.experienceMin || errors.experienceMax || errors.experienceRange) && (
              <p className="text-xs text-destructive">
                {errors.experienceMin ?? errors.experienceMax ?? errors.experienceRange}
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Added date</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="candidate-added-from" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="candidate-added-from"
                  type="date"
                  value={draft.addedFrom}
                  aria-invalid={!!errors.addedFrom || !!errors.addedRange}
                  onChange={(event) => update("addedFrom", event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="candidate-added-to" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="candidate-added-to"
                  type="date"
                  value={draft.addedTo}
                  aria-invalid={!!errors.addedTo || !!errors.addedRange}
                  onChange={(event) => update("addedTo", event.target.value)}
                />
              </div>
            </div>
            {(errors.addedFrom || errors.addedTo || errors.addedRange) && (
              <p className="text-xs text-destructive">
                {errors.addedFrom ?? errors.addedTo ?? errors.addedRange}
              </p>
            )}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="candidate-sort">Sort by</Label>
            <Select
              value={draft.sort}
              onValueChange={(value) => update("sort", value as CandidateSort)}
            >
              <SelectTrigger id="candidate-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="added-newest">Added: newest first</SelectItem>
                <SelectItem value="added-oldest">Added: oldest first</SelectItem>
                <SelectItem value="stage-longest">Time in stage: longest first</SelectItem>
                <SelectItem value="stage-shortest">Time in stage: shortest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClear}>
            Clear all
          </Button>
          <Button type="button" disabled={hasErrors} onClick={onApply}>
            Apply filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
