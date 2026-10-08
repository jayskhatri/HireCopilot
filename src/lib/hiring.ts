import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { queryOptions } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  appSettingsFromRow,
  slaBucketLabels,
  slaLevel,
  type AppSettings,
  type SlaThresholds,
} from "./app-settings";

export { slaLevel, type SlaLevel, type SlaThresholds } from "./app-settings";

export const STAGES = ["SCREENING", "L1", "L2", "L3", "OFFER", "REJECTED"] as const;
export type Stage = (typeof STAGES)[number];

export const BUSINESS_HOURS_START = 9;
export const BUSINESS_HOURS_END = 17;

export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export const SLOT_LEAD_BUFFER_MINUTES = 30;

export function isSlotBookable(
  start: Date,
  now: Date,
  bufferMinutes: number = SLOT_LEAD_BUFFER_MINUTES,
): boolean {
  return start.getTime() >= now.getTime() + bufferMinutes * 60_000;
}

export const STAGE_LABEL: Record<string, string> = {
  SCREENING: "Screening",
  L1: "L1 Technical",
  L2: "L2 Technical",
  L3: "L3 / Leadership",
  OFFER: "Offer",
  REJECTED: "Rejected",
};

export type Job = {
  id: string;
  job_code: string;
  title: string;
  department_id: string;
  department: string;
  description: string | null;
  location: string;
  required_skills: string[];
  open_since: string;
  status: PositionStatus;
  departments?: Department | null;
};

export type Department = {
  id: string;
  name: string;
  code: string;
  created_at: string;
};

export type PositionStatus = "OPEN" | "CLOSED";

export type Interviewer = {
  id: string;
  name: string;
  email: string;
  title: string;
  skills: string[];
  timezone: string;
};

export type Candidate = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  resume_url: string | null;
  job_id: string | null;
  source: string;
  experience_years: number;
  skills: string[];
  current_stage: string;
  status_updated_at: string;
  created_at: string;
  rejection_reason: string | null;
  jobs?: {
    id: string;
    job_code: string;
    title: string;
    department_id: string;
    department: string;
    location: string;
    status: PositionStatus;
    departments?: Pick<Department, "id" | "name" | "code"> | null;
  } | null;
};

export const IMPORT_ROW_LIMIT = 100;

function normalizeCandidateResumeUrl(value: string): string | null {
  if (/\s/u.test(value)) return null;

  const authorityMatch = value.match(/^https:\/\/([^/?#]+)(?:[/?#][\s\S]*)?$/i);
  const authority = authorityMatch?.[1];
  if (!authority || authority.includes("@")) return null;

  let host: string;
  let port: string | undefined;
  const ipv6Match = authority.match(/^(\[[0-9a-f:.]+\])(?::([0-9]+))?$/i);
  const ipv6Host = ipv6Match?.[1];
  if (ipv6Match && ipv6Host) {
    host = ipv6Host;
    port = ipv6Match[2];
  } else {
    const hostMatch = authority.match(/^([^:]+)(?::([0-9]+))?$/);
    const matchedHost = hostMatch?.[1];
    if (!matchedHost) return null;
    host = matchedHost;
    port = hostMatch[2];
  }

  if (port !== undefined && (port.length > 5 || Number(port) > 65535)) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;

    if (host.startsWith("[")) {
      if (url.hostname.toLowerCase() !== host.toLowerCase()) return null;
    } else if (/^[0-9.]+$/.test(host)) {
      if (!/^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$/.test(host)) {
        return null;
      }
      if (host.split(".").some((octet) => Number(octet) > 255) || url.hostname !== host) {
        return null;
      }
    } else {
      const dnsName = host.endsWith(".") ? host.slice(0, -1) : host;
      const labels = dnsName.split(".");
      if (
        dnsName.length > 253 ||
        labels.some(
          (label) => label.length > 63 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(label),
        ) ||
        url.hostname.toLowerCase() !== host.toLowerCase()
      ) {
        return null;
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}

export type CsvImportIssue = {
  row: number | null;
  field: string;
  message: string;
};

export type CsvImportPreview<T> = {
  rows: Array<{ row: number; value: T }>;
  issues: CsvImportIssue[];
};

export type CandidateImportRow = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  job_code: string;
  source: string;
  experience_years: number;
  skills: string[];
  current_stage: string;
  resume_url: string | null;
};

export type PositionImportRow = {
  title: string;
  department: string;
  description: string | null;
  location: string;
  required_skills: string[];
  status: PositionStatus;
};

type ParsedCsv = {
  headers: string[];
  records: string[][];
  issues: CsvImportIssue[];
};

function parseCsv(csv: string, expectedHeaders: readonly string[]): ParsedCsv {
  const records: string[][] = [];
  const issues: CsvImportIssue[] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  let malformed = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index] ?? "";
    if (quoted) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (afterQuote && char !== "," && char !== "\r" && char !== "\n") {
      if (!/\s/.test(char)) {
        malformed = true;
        break;
      }
      continue;
    }
    if (char === '"') {
      if (field.length > 0) {
        malformed = true;
        break;
      }
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
      afterQuote = false;
    } else if (char === "\r" || char === "\n") {
      record.push(field);
      if (record.some((value) => value.trim() !== "")) records.push(record);
      record = [];
      field = "";
      afterQuote = false;
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
    } else {
      field += char;
    }
  }

  if (quoted) malformed = true;
  if (malformed) {
    issues.push({ row: records.length + 1, field: "CSV", message: "Malformed CSV quoting" });
    return { headers: [], records: [], issues };
  }
  if (field.length || record.length) {
    record.push(field);
    if (record.some((value) => value.trim() !== "")) records.push(record);
  }
  if (!records.length) {
    issues.push({ row: 1, field: "header", message: "CSV file is empty" });
    return { headers: [], records: [], issues };
  }

  const headerRecord = records[0] ?? [];
  const headers = headerRecord.map((value, index) => {
    const clean = value.trim();
    return index === 0 ? clean.replace(/^\uFEFF/, "") : clean;
  });
  const missing = expectedHeaders.filter((header) => !headers.includes(header));
  const extra = headers.filter((header) => !expectedHeaders.includes(header));
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (missing.length || extra.length || duplicates.length) {
    const details = [
      missing.length ? `Missing: ${missing.join(", ")}` : "",
      extra.length ? `Unexpected: ${extra.join(", ")}` : "",
      duplicates.length ? `Duplicate: ${[...new Set(duplicates)].join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(". ");
    issues.push({
      row: 1,
      field: "header",
      message: `Headers must match the required set. ${details}`,
    });
    return { headers, records: [], issues };
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length > IMPORT_ROW_LIMIT) {
    issues.push({
      row: null,
      field: "CSV",
      message: `The file has ${dataRecords.length} data rows; the maximum is ${IMPORT_ROW_LIMIT}`,
    });
    return { headers, records: [], issues };
  }
  return { headers, records: dataRecords, issues };
}

function csvRecords(csv: string, headers: string[]) {
  const parsed = parseCsv(csv, headers);
  const widthIssues = parsed.records.flatMap((values, index) =>
    values.length === parsed.headers.length
      ? []
      : [
          {
            row: index + 2,
            field: "CSV",
            message: `Expected ${parsed.headers.length} columns but found ${values.length}`,
          },
        ],
  );
  return {
    records: parsed.records.map((values, index) => ({
      row: index + 2,
      values: Object.fromEntries(
        parsed.headers.map((header, column) => [header, values[column] ?? ""]),
      ),
    })),
    issues: [...parsed.issues, ...widthIssues],
  };
}

function splitSkills(value: string) {
  return value
    .split(";")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function addRequiredIssue(issues: CsvImportIssue[], row: number, field: string, value: string) {
  if (!value.trim()) issues.push({ row, field, message: `${field} is required` });
}

export function previewCandidateCsv(
  csv: string,
  jobs: Job[],
  existingCandidates: Candidate[],
): CsvImportPreview<CandidateImportRow> {
  const headers = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "job_code",
    "source",
    "experience_years",
    "skills",
    "current_stage",
    "resume_url",
  ];
  const parsed = csvRecords(csv, headers);
  const issues = [...parsed.issues];
  const seenEmails = new Set<string>();
  const existingEmails = new Set(
    existingCandidates.map((candidate) => candidate.email.trim().toLowerCase()),
  );
  const openJobs = new Map(
    jobs.filter((job) => job.status === "OPEN").map((job) => [job.job_code, job]),
  );
  const rows = parsed.records.map(({ row, values }) => {
    const first_name = (values["first_name"] ?? "").trim();
    const last_name = (values["last_name"] ?? "").trim();
    const email = (values["email"] ?? "").trim().toLowerCase();
    const job_code = (values["job_code"] ?? "").trim();
    const source = (values["source"] ?? "").trim() || "Referral";
    const experienceText = (values["experience_years"] ?? "").trim();
    const experience_years = experienceText ? Number(experienceText) : 5;
    const skills = splitSkills(values["skills"] ?? "");
    const current_stage = (values["current_stage"] ?? "").trim() || "SCREENING";
    const rawResumeUrl = values["resume_url"] ?? "";
    let resume_url: string | null = rawResumeUrl.trim() ? rawResumeUrl : null;

    addRequiredIssue(issues, row, "first_name", first_name);
    addRequiredIssue(issues, row, "last_name", last_name);
    addRequiredIssue(issues, row, "email", email);
    addRequiredIssue(issues, row, "job_code", job_code);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      issues.push({ row, field: "email", message: "Enter a valid email address" });
    }
    if (email && (seenEmails.has(email) || existingEmails.has(email))) {
      issues.push({
        row,
        field: "email",
        message: "Email is already present in this file or candidates",
      });
    }
    if (email) seenEmails.add(email);
    if (job_code && !openJobs.has(job_code)) {
      issues.push({ row, field: "job_code", message: "Must match an existing OPEN job code" });
    }
    if (!Number.isFinite(experience_years) || experience_years < 0 || experience_years > 50) {
      issues.push({
        row,
        field: "experience_years",
        message: "Experience must be between 0 and 50",
      });
    }
    if (!STAGES.includes(current_stage as Stage)) {
      issues.push({ row, field: "current_stage", message: `Must be one of: ${STAGES.join(", ")}` });
    }
    if (resume_url) {
      const normalizedResumeUrl = normalizeCandidateResumeUrl(resume_url);
      if (normalizedResumeUrl) {
        resume_url = normalizedResumeUrl;
      } else {
        issues.push({
          row,
          field: "resume_url",
          message:
            "Use an HTTPS URL with a valid DNS, IPv4, or bracketed IPv6 host and a port from 0 to 65535",
        });
      }
    }
    return {
      row,
      value: {
        first_name,
        last_name,
        email,
        phone: (values["phone"] ?? "").trim() || null,
        job_code,
        source,
        experience_years,
        skills,
        current_stage,
        resume_url,
      },
    };
  });
  return { rows, issues };
}

export function previewPositionCsv(
  csv: string,
  departments: Department[],
): CsvImportPreview<PositionImportRow> {
  const headers = ["title", "department", "description", "location", "required_skills", "status"];
  const parsed = csvRecords(csv, headers);
  const issues = [...parsed.issues];
  const departmentByName = new Map<string, Department[]>();
  departments.forEach((department) => {
    const key = department.name.trim().toLowerCase();
    departmentByName.set(key, [...(departmentByName.get(key) ?? []), department]);
  });
  const rows = parsed.records.map(({ row, values }) => {
    const title = (values["title"] ?? "").trim();
    const department = (values["department"] ?? "").trim();
    const description = (values["description"] ?? "").trim() || null;
    const location = (values["location"] ?? "").trim() || "Bengaluru, IN";
    const required_skills = splitSkills(values["required_skills"] ?? "");
    const status = ((values["status"] ?? "").trim() || "OPEN").toUpperCase() as PositionStatus;
    addRequiredIssue(issues, row, "title", title);
    addRequiredIssue(issues, row, "department", department);
    const matches = departmentByName.get(department.toLowerCase()) ?? [];
    if (department && matches.length !== 1) {
      issues.push({
        row,
        field: "department",
        message: matches.length
          ? "Department name is ambiguous"
          : "Must match an existing department",
      });
    }
    if (status !== "OPEN" && status !== "CLOSED") {
      issues.push({ row, field: "status", message: "Must be OPEN or CLOSED" });
    }
    const value: PositionImportRow = {
      title,
      department: matches.length === 1 ? (matches[0]?.name ?? department) : department,
      description,
      location,
      required_skills,
      status: status === "CLOSED" ? "CLOSED" : "OPEN",
    };
    return { row, value };
  });
  return { rows, issues };
}

export function csvImportErrorReport(issues: CsvImportIssue[]) {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return [
    "row,field,error",
    ...issues.map((issue) => `${issue.row ?? ""},${quote(issue.field)},${quote(issue.message)}`),
  ].join("\r\n");
}

export type CandidateSort = "added-newest" | "added-oldest" | "stage-longest" | "stage-shortest";

export type CandidateSlaBucket = "on-track" | "warning" | "breach";

export type CandidateAdvancedFilters = {
  positionIds: string[];
  departmentIds: string[];
  locations: string[];
  sources: string[];
  skills: string[];
  slaBuckets: CandidateSlaBucket[];
  experienceMin: string;
  experienceMax: string;
  addedFrom: string;
  addedTo: string;
  sort: CandidateSort;
};

export type CandidateFilterOption = {
  value: string;
  label: string;
};

export type CandidateAdvancedFilterOptions = {
  positions: CandidateFilterOption[];
  departments: CandidateFilterOption[];
  locations: CandidateFilterOption[];
  sources: CandidateFilterOption[];
  skills: CandidateFilterOption[];
  slaBuckets: Array<CandidateFilterOption & { value: CandidateSlaBucket }>;
};

export const UNASSIGNED_POSITION_FILTER = "__unassigned_position__";
export const UNASSIGNED_DEPARTMENT_FILTER = "__unassigned_department__";
const LEGACY_DEPARTMENT_PREFIX = "legacy:";

export function createDefaultCandidateAdvancedFilters(): CandidateAdvancedFilters {
  return {
    positionIds: [],
    departmentIds: [],
    locations: [],
    sources: [],
    skills: [],
    slaBuckets: [],
    experienceMin: "",
    experienceMax: "",
    addedFrom: "",
    addedTo: "",
    sort: "added-newest",
  };
}

function normalizeCandidateFilterValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function legacyDepartmentFilterValue(name: string) {
  return `${LEGACY_DEPARTMENT_PREFIX}${normalizeCandidateFilterValue(name)}`;
}

function candidateDepartmentFilterValue(candidate: Candidate) {
  const department = candidate.jobs?.departments;
  if (department?.id) return department.id;

  const legacyName = department?.name ?? candidate.jobs?.department;
  return legacyName?.trim()
    ? legacyDepartmentFilterValue(legacyName)
    : UNASSIGNED_DEPARTMENT_FILTER;
}

function normalizedOptions(values: Array<string | null | undefined>): CandidateFilterOption[] {
  const options = new Map<string, string>();
  values.forEach((value) => {
    const label = value?.trim();
    const normalized = normalizeCandidateFilterValue(label);
    if (label && normalized && !options.has(normalized)) options.set(normalized, label);
  });

  return [...options]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
    );
}

export function deriveCandidateAdvancedFilterOptions(
  candidates: Candidate[],
  t: SlaThresholds,
): CandidateAdvancedFilterOptions {
  const positions = new Map<string, string>();
  const departments = new Map<string, string>();
  let hasUnassignedPosition = false;
  let hasUnassignedDepartment = false;

  candidates.forEach((candidate) => {
    if (candidate.job_id && candidate.jobs) {
      positions.set(candidate.job_id, jobLabel(candidate.jobs));
    } else {
      hasUnassignedPosition = true;
    }

    const departmentValue = candidateDepartmentFilterValue(candidate);
    if (departmentValue === UNASSIGNED_DEPARTMENT_FILTER) {
      hasUnassignedDepartment = true;
    } else {
      const label = candidate.jobs?.departments?.name ?? candidate.jobs?.department;
      if (label?.trim()) departments.set(departmentValue, label.trim());
    }
  });

  const positionOptions = [...positions].map(([value, label]) => ({ value, label }));
  const departmentOptions = [...departments].map(([value, label]) => ({ value, label }));
  positionOptions.sort((left, right) => left.label.localeCompare(right.label));
  departmentOptions.sort((left, right) => left.label.localeCompare(right.label));

  if (hasUnassignedPosition) {
    positionOptions.push({ value: UNASSIGNED_POSITION_FILTER, label: "Unassigned" });
  }
  if (hasUnassignedDepartment) {
    departmentOptions.push({ value: UNASSIGNED_DEPARTMENT_FILTER, label: "Unassigned" });
  }

  const slaLabels = slaBucketLabels(t);

  return {
    positions: positionOptions,
    departments: departmentOptions,
    locations: normalizedOptions(candidates.map((candidate) => candidate.jobs?.location)),
    sources: normalizedOptions(candidates.map((candidate) => candidate.source)),
    skills: normalizedOptions(candidates.flatMap((candidate) => candidate.skills)),
    slaBuckets: [
      { value: "on-track", label: slaLabels["on-track"] },
      { value: "warning", label: slaLabels.warning },
      { value: "breach", label: slaLabels.breach },
    ],
  };
}

function parseExperienceBound(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseLocalDate(value: string, endOfDay: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return Number.NaN;
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return Number.NaN;
  }
  return date.getTime();
}

export function validateCandidateAdvancedFilters(filters: CandidateAdvancedFilters) {
  const errors: Partial<
    Record<
      | "experienceMin"
      | "experienceMax"
      | "experienceRange"
      | "addedFrom"
      | "addedTo"
      | "addedRange",
      string
    >
  > = {};
  const experienceMin = parseExperienceBound(filters.experienceMin);
  const experienceMax = parseExperienceBound(filters.experienceMax);

  if (
    experienceMin !== null &&
    (!Number.isFinite(experienceMin) || experienceMin < 0 || experienceMin > 50)
  ) {
    errors.experienceMin = "Enter a number from 0 to 50.";
  }
  if (
    experienceMax !== null &&
    (!Number.isFinite(experienceMax) || experienceMax < 0 || experienceMax > 50)
  ) {
    errors.experienceMax = "Enter a number from 0 to 50.";
  }
  if (
    experienceMin !== null &&
    experienceMax !== null &&
    Number.isFinite(experienceMin) &&
    Number.isFinite(experienceMax) &&
    experienceMin > experienceMax
  ) {
    errors.experienceRange = "Minimum experience cannot exceed maximum experience.";
  }

  const addedFrom = filters.addedFrom ? parseLocalDate(filters.addedFrom, false) : null;
  const addedTo = filters.addedTo ? parseLocalDate(filters.addedTo, true) : null;
  if (addedFrom !== null && !Number.isFinite(addedFrom)) errors.addedFrom = "Enter a valid date.";
  if (addedTo !== null && !Number.isFinite(addedTo)) errors.addedTo = "Enter a valid date.";
  if (
    addedFrom !== null &&
    addedTo !== null &&
    Number.isFinite(addedFrom) &&
    Number.isFinite(addedTo) &&
    addedFrom > addedTo
  ) {
    errors.addedRange = "Start date cannot be after end date.";
  }

  return errors;
}

function candidateSlaBucket(
  candidate: Candidate,
  now: number,
  t: SlaThresholds,
): CandidateSlaBucket | null {
  const timestamp = new Date(candidate.status_updated_at).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const days = Math.floor((now - timestamp) / 86_400_000);
  if (days < 0) return null;
  const level = slaLevel(days, t);
  return level === "ok" ? "on-track" : level;
}

export function matchesCandidateAdvancedFilters(
  candidate: Candidate,
  filters: CandidateAdvancedFilters,
  now: number,
  t: SlaThresholds,
) {
  const positionValue =
    candidate.job_id && candidate.jobs ? candidate.job_id : UNASSIGNED_POSITION_FILTER;
  if (filters.positionIds.length && !filters.positionIds.includes(positionValue)) return false;
  if (
    filters.departmentIds.length &&
    !filters.departmentIds.includes(candidateDepartmentFilterValue(candidate))
  )
    return false;

  const location = normalizeCandidateFilterValue(candidate.jobs?.location);
  if (filters.locations.length && !filters.locations.includes(location)) return false;
  const source = normalizeCandidateFilterValue(candidate.source);
  if (filters.sources.length && !filters.sources.includes(source)) return false;
  const skills = candidate.skills.map(normalizeCandidateFilterValue);
  if (filters.skills.length && !filters.skills.some((skill) => skills.includes(skill)))
    return false;

  if (filters.slaBuckets.length) {
    const bucket = candidateSlaBucket(candidate, now, t);
    if (!bucket || !filters.slaBuckets.includes(bucket)) return false;
  }

  const experienceMin = parseExperienceBound(filters.experienceMin);
  const experienceMax = parseExperienceBound(filters.experienceMax);
  if (experienceMin !== null && candidate.experience_years < experienceMin) return false;
  if (experienceMax !== null && candidate.experience_years > experienceMax) return false;

  const createdAt = new Date(candidate.created_at).getTime();
  if (filters.addedFrom) {
    const addedFrom = parseLocalDate(filters.addedFrom, false);
    if (!Number.isFinite(createdAt) || createdAt < addedFrom) return false;
  }
  if (filters.addedTo) {
    const addedTo = parseLocalDate(filters.addedTo, true);
    if (!Number.isFinite(createdAt) || createdAt > addedTo) return false;
  }

  return true;
}

function compareCandidateNames(left: Candidate, right: Candidate) {
  const leftName = fullName(left).normalize("NFKC").toLowerCase();
  const rightName = fullName(right).normalize("NFKC").toLowerCase();
  if (leftName !== rightName) return leftName < rightName ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export function sortCandidates(candidates: Candidate[], sort: CandidateSort): Candidate[] {
  const timestampField = sort.startsWith("added") ? "created_at" : "status_updated_at";
  const ascending = sort === "added-oldest" || sort === "stage-longest";

  return [...candidates].sort((left, right) => {
    const leftTimestamp = new Date(left[timestampField]).getTime();
    const rightTimestamp = new Date(right[timestampField]).getTime();
    const leftValid = Number.isFinite(leftTimestamp);
    const rightValid = Number.isFinite(rightTimestamp);
    if (leftValid !== rightValid) return leftValid ? -1 : 1;
    if (leftValid && rightValid && leftTimestamp !== rightTimestamp) {
      return ascending ? leftTimestamp - rightTimestamp : rightTimestamp - leftTimestamp;
    }
    return compareCandidateNames(left, right);
  });
}

export function countActiveCandidateAdvancedFilters(filters: CandidateAdvancedFilters) {
  return (
    filters.positionIds.length +
    filters.departmentIds.length +
    filters.locations.length +
    filters.sources.length +
    filters.skills.length +
    filters.slaBuckets.length +
    [filters.experienceMin, filters.experienceMax, filters.addedFrom, filters.addedTo].filter(
      (value) => value.trim(),
    ).length
  );
}

export type Interview = {
  id: string;
  candidate_id: string;
  job_id: string | null;
  interviewer_id: string | null;
  stage: string;
  scheduled_start: string;
  scheduled_end: string;
  meeting_link: string | null;
  status: string;
  booking_group_id: string;
  candidates?: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    source: string;
    current_stage: string;
  } | null;
  interviewers?: { name: string; title: string; email: string } | null;
  jobs?: {
    id: string;
    job_code: string;
    title: string;
    department: string;
    location: string;
    status: PositionStatus;
    departments?: Pick<Department, "name" | "code"> | null;
  } | null;
};

export type EffectivePosition = {
  id: string | null;
  job_code: string | null;
  title: string | null;
  department: string | null;
  location: string | null;
  status: PositionStatus | null;
  departments?: Pick<Department, "name" | "code"> | null;
  isUnassigned: boolean;
};

export type InterviewEventEntry = {
  id: string;
  booking_group_id: string;
  candidate_id: string;
  stage: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  position: EffectivePosition;
  interviewer_names: string[];
  interviewer_titles: string[];
  interviews: Interview[];
};

const UNASSIGNED_POSITION: EffectivePosition = {
  id: null,
  job_code: null,
  title: null,
  department: null,
  location: null,
  status: null,
  departments: null,
  isUnassigned: true,
};

export function jobLabel(job: Pick<Job, "job_code" | "title"> | NonNullable<Candidate["jobs"]>) {
  return `${job.job_code} — ${job.title}`;
}

export function positionLabel(
  position: Pick<EffectivePosition, "job_code" | "title" | "isUnassigned">,
) {
  if (position.isUnassigned || !position.job_code || !position.title) return "Unassigned";
  return `${position.job_code} — ${position.title}`;
}

export function resolveInterviewPosition(
  interview: Pick<Interview, "job_id" | "jobs">,
  candidateJob?: Candidate["jobs"] | null,
): EffectivePosition {
  if (interview.job_id && interview.jobs) {
    return {
      id: interview.jobs.id,
      job_code: interview.jobs.job_code,
      title: interview.jobs.title,
      department: interview.jobs.department,
      location: interview.jobs.location,
      status: interview.jobs.status,
      departments: interview.jobs.departments ?? null,
      isUnassigned: false,
    };
  }

  if (candidateJob) {
    return {
      id: candidateJob.id,
      job_code: candidateJob.job_code,
      title: candidateJob.title,
      department: candidateJob.department,
      location: candidateJob.location,
      status: candidateJob.status,
      departments: candidateJob.departments ?? null,
      isUnassigned: false,
    };
  }

  return UNASSIGNED_POSITION;
}

export function resolveFeedbackInterviewPosition(
  interview: Pick<Interview, "job_id" | "jobs">,
  candidateJob?: Candidate["jobs"] | null,
): EffectivePosition {
  if (!interview.job_id) {
    return resolveInterviewPosition(interview, null);
  }

  return resolveInterviewPosition(interview, candidateJob);
}

export function selectCandidateFeedbackInterview(
  candidate: Pick<Candidate, "id" | "job_id">,
  interviews: Interview[],
): Interview | null {
  const candidateInterviews = interviews
    .filter((interview) => interview.candidate_id === candidate.id)
    .sort(
      (left, right) =>
        new Date(right.scheduled_start).getTime() - new Date(left.scheduled_start).getTime(),
    );

  const nonCancelled = candidateInterviews.filter((interview) => interview.status !== "CANCELLED");
  const pool = nonCancelled.length ? nonCancelled : candidateInterviews;

  if (!pool.length) return null;
  if (!candidate.job_id) return pool[0] ?? null;

  const matchingInterview = pool.find((interview) => interview.job_id === candidate.job_id);
  if (matchingInterview) return matchingInterview;

  if (pool.length === 1 && pool[0]?.job_id === null) {
    return pool[0];
  }

  return null;
}

export const NEXT_STAGE: Record<string, Stage | undefined> = {
  SCREENING: "L1",
  L1: "L2",
  L2: "L3",
};

export function nextStageAfter(stage: string): Stage | null {
  return NEXT_STAGE[stage] ?? null;
}

export const CARD_DATETIME_FORMAT = "d MMM, h:mm a";

export function formatCardDateTime(value: Date | string | null): string {
  if (!value) return "an unknown time";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "an unknown time" : format(date, CARD_DATETIME_FORMAT);
}

export type FeedbackDisabledReason =
  | "loading"
  | "unavailable"
  | "no-interview"
  | "ambiguous-match"
  | "candidate-rejected"
  | "interview-cancelled"
  | "already-submitted"
  | "not-finished";

export const INTERVIEW_DATA_UNAVAILABLE_TOOLTIP =
  "Interview data could not be loaded. Refresh the page and try again.";

export type ScheduleDisabledReason = "candidate-rejected" | "candidate-offered";

export type ScheduleStateKey =
  "candidate-rejected" | "candidate-offered" | "already-scheduled" | "default";

export type PipelineIndicatorTone = "success" | "warning" | "destructive";
export type PipelineIndicatorIcon = "calendar-plus" | "check-circle" | "alert-triangle";

export type PipelineCardIndicator = {
  mode: "schedule-next" | "decide";
  label: string;
  tooltip: string;
  tone: PipelineIndicatorTone;
  icon: PipelineIndicatorIcon;
};

export type PipelineActionState<TReason> = {
  enabled: boolean;
  reason: TReason | null;
  tooltip: string;
};

export type PipelineCardState = {
  targetInterview: Interview | null;
  bookingGroup: Interview[];
  groupStart: Date | null;
  groupEnd: Date | null;
  feedbackEntry: FeedbackEntry | null;
  feedback: PipelineActionState<FeedbackDisabledReason>;
  schedule: PipelineActionState<ScheduleDisabledReason> & { state: ScheduleStateKey };
  indicator: PipelineCardIndicator | null;
};

function deriveIndicator(
  round: string,
  feedbackEntry: FeedbackEntry,
): PipelineCardIndicator | null {
  if (round === "OFFER" || round === "REJECTED") return null;

  const nextStage = nextStageAfter(round);
  const nextRoundLabel = nextStage ? (STAGE_LABEL[nextStage] ?? nextStage) : null;
  const mode: PipelineCardIndicator["mode"] = nextStage ? "schedule-next" : "decide";

  let label: string;
  let tone: PipelineIndicatorTone;
  let icon: PipelineIndicatorIcon;

  if (feedbackEntry.decision === "REJECT") {
    label = "Reject recommended — review and decide";
    tone = "destructive";
    icon = "alert-triangle";
  } else if (feedbackEntry.decision === "BORDERLINE") {
    label = nextRoundLabel
      ? `Borderline — review, then schedule ${nextRoundLabel}`
      : "Borderline — reject or make an offer";
    tone = "warning";
    icon = "alert-triangle";
  } else if (feedbackEntry.decision === "SELECT") {
    label = nextRoundLabel
      ? `Schedule ${nextRoundLabel}`
      : "Ready for offer — reject or make an offer";
    tone = "success";
    icon = nextRoundLabel ? "calendar-plus" : "check-circle";
  } else {
    return null;
  }

  return {
    mode,
    label,
    tone,
    icon,
    tooltip: `${label} · Risk: ${feedbackEntry.risk_level} · Score ${feedbackEntry.overall_score}/10`,
  };
}

export function derivePipelineCardState(input: {
  candidate: Candidate;
  interviews: Interview[];
  feedback: FeedbackEntry[];
  now: Date;
  loading: boolean;
  errored: boolean;
}): PipelineCardState {
  const { candidate, interviews, feedback, now, loading, errored } = input;

  const candidateInterviews = interviews.filter(
    (interview) => interview.candidate_id === candidate.id,
  );
  const targetInterview = selectCandidateFeedbackInterview(candidate, interviews);

  const bookingGroup = targetInterview
    ? targetInterview.booking_group_id
      ? candidateInterviews.filter(
          (interview) => interview.booking_group_id === targetInterview.booking_group_id,
        )
      : [targetInterview]
    : [];

  const startTimes = bookingGroup.map((interview) => new Date(interview.scheduled_start).getTime());
  const endTimes = bookingGroup.map((interview) => new Date(interview.scheduled_end).getTime());
  const groupStart = startTimes.length ? new Date(Math.min(...startTimes)) : null;
  const groupEnd = endTimes.length ? new Date(Math.max(...endTimes)) : null;

  const groupIds = new Set(bookingGroup.map((interview) => interview.id));
  const feedbackEntry =
    feedback
      .filter((entry) => groupIds.has(entry.interview_id))
      .sort((left, right) =>
        left.submitted_at === right.submitted_at
          ? left.id.localeCompare(right.id)
          : left.submitted_at.localeCompare(right.submitted_at),
      )[0] ?? null;

  const rejected = candidate.current_stage === "REJECTED";
  const roundLabel = targetInterview
    ? (STAGE_LABEL[targetInterview.stage] ?? targetInterview.stage)
    : "";

  let feedbackState: PipelineActionState<FeedbackDisabledReason>;
  if (errored) {
    feedbackState = {
      enabled: false,
      reason: "unavailable",
      tooltip: INTERVIEW_DATA_UNAVAILABLE_TOOLTIP,
    };
  } else if (loading) {
    feedbackState = { enabled: false, reason: "loading", tooltip: "Loading interview data…" };
  } else if (!targetInterview && !candidateInterviews.length) {
    feedbackState = {
      enabled: false,
      reason: "no-interview",
      tooltip: "No interview has been scheduled for this candidate yet.",
    };
  } else if (!targetInterview) {
    feedbackState = {
      enabled: false,
      reason: "ambiguous-match",
      tooltip:
        "This candidate's interviews don't match their assigned position. Open the candidate record and fix the position link before adding feedback.",
    };
  } else if (rejected) {
    feedbackState = {
      enabled: false,
      reason: "candidate-rejected",
      tooltip: "Candidate is rejected. Feedback can no longer be added.",
    };
  } else if (targetInterview.status === "CANCELLED") {
    feedbackState = {
      enabled: false,
      reason: "interview-cancelled",
      tooltip: "The last interview was cancelled. Schedule a new round to collect feedback.",
    };
  } else if (feedbackEntry) {
    feedbackState = {
      enabled: false,
      reason: "already-submitted",
      tooltip: `Feedback was already submitted on ${formatCardDateTime(feedbackEntry.submitted_at)}. Schedule the next round to move this candidate forward.`,
    };
  } else if (groupEnd && now < groupEnd) {
    feedbackState = {
      enabled: false,
      reason: "not-finished",
      tooltip: `This interview ends at ${formatCardDateTime(groupEnd)}. Feedback can be given once it's over.`,
    };
  } else {
    feedbackState = {
      enabled: true,
      reason: null,
      tooltip: `Record feedback for the ${roundLabel} interview on ${formatCardDateTime(groupStart)}.`,
    };
  }

  let scheduleState: PipelineCardState["schedule"];
  if (rejected) {
    scheduleState = {
      enabled: false,
      reason: "candidate-rejected",
      state: "candidate-rejected",
      tooltip: "Candidate is rejected. Restore them from the Candidates page before scheduling.",
    };
  } else if (candidate.current_stage === "OFFER") {
    scheduleState = {
      enabled: false,
      reason: "candidate-offered",
      state: "candidate-offered",
      tooltip: "Candidate already has an offer — is now handled by onboarding.",
    };
  } else if (errored) {
    scheduleState = {
      enabled: true,
      reason: null,
      state: "default",
      tooltip: INTERVIEW_DATA_UNAVAILABLE_TOOLTIP,
    };
  } else if (
    targetInterview &&
    targetInterview.status !== "CANCELLED" &&
    groupEnd &&
    now < groupEnd
  ) {
    scheduleState = {
      enabled: true,
      reason: null,
      state: "already-scheduled",
      tooltip: `An interview is already scheduled for ${formatCardDateTime(groupStart)}. Scheduling again will add another round.`,
    };
  } else {
    scheduleState = {
      enabled: true,
      reason: null,
      state: "default",
      tooltip: "Schedule the next interview round.",
    };
  }

  const indicator =
    feedbackEntry && targetInterview && !rejected && candidate.current_stage !== "OFFER"
      ? deriveIndicator(targetInterview.stage, feedbackEntry)
      : null;

  return {
    targetInterview,
    bookingGroup,
    groupStart,
    groupEnd,
    feedbackEntry,
    feedback: feedbackState,
    schedule: scheduleState,
    indicator,
  };
}

function eventStatus(interviews: Interview[]) {
  if (interviews.some((interview) => interview.status === "SCHEDULED")) return "SCHEDULED";
  if (interviews.some((interview) => interview.status === "COMPLETED")) return "COMPLETED";
  if (interviews.some((interview) => interview.status === "CANCELLED")) return "CANCELLED";
  if (interviews.some((interview) => interview.status === "NO_SHOW")) return "NO_SHOW";
  return interviews[0]?.status ?? "UNKNOWN";
}

export function groupCandidateInterviews(
  candidate: Pick<Candidate, "id" | "jobs">,
  interviews: Interview[],
): InterviewEventEntry[] {
  const grouped = new Map<string, Interview[]>();

  for (const interview of interviews) {
    if (interview.candidate_id !== candidate.id) continue;
    const groupKey = interview.booking_group_id || interview.id;
    const entry = grouped.get(groupKey);
    if (entry) {
      entry.push(interview);
    } else {
      grouped.set(groupKey, [interview]);
    }
  }

  const now = Date.now();

  return [...grouped.entries()]
    .map(([groupId, eventInterviews]) => {
      const ordered = [...eventInterviews].sort(
        (left, right) =>
          new Date(left.scheduled_start).getTime() - new Date(right.scheduled_start).getTime(),
      );
      const first = ordered[0]!;
      const last = ordered[ordered.length - 1]!;
      const interviewerNames = [
        ...new Set(ordered.map((item) => item.interviewers?.name).filter(Boolean)),
      ] as string[];
      const interviewerTitles = [
        ...new Set(ordered.map((item) => item.interviewers?.title).filter(Boolean)),
      ] as string[];

      return {
        id: groupId,
        booking_group_id: groupId,
        candidate_id: candidate.id,
        stage: first.stage,
        scheduled_start: first.scheduled_start,
        scheduled_end: last.scheduled_end,
        status: eventStatus(ordered),
        position: resolveInterviewPosition(first, candidate.jobs),
        interviewer_names: interviewerNames,
        interviewer_titles: interviewerTitles,
        interviews: ordered,
      };
    })
    .sort((left, right) => {
      const leftStart = new Date(left.scheduled_start).getTime();
      const rightStart = new Date(right.scheduled_start).getTime();
      const leftUpcoming = left.status === "SCHEDULED" && leftStart >= now;
      const rightUpcoming = right.status === "SCHEDULED" && rightStart >= now;

      if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
      if (leftUpcoming && rightUpcoming) return leftStart - rightStart;
      return rightStart - leftStart;
    });
}

export const ROUND_ORDER = ["SCREENING", "L1", "L2", "L3", "OFFER"] as const;
export type Round = (typeof ROUND_ORDER)[number];

export function isRound(stage: string): stage is Round {
  return (ROUND_ORDER as readonly string[]).includes(stage);
}

export type RoundProgression = {
  floor: number;
  defaultRound: Round;
  selectable: Round[];
  locked: Round[];
  highestAttempted: Round | null;
  completedRounds: Round[];
};

export function resolveRoundProgression(
  candidate: Pick<Candidate, "id" | "jobs" | "current_stage">,
  interviews: Interview[],
): RoundProgression {
  const groups = groupCandidateInterviews(candidate, interviews).filter(
    (group) => group.status !== "CANCELLED",
  );

  let highestIndex = -1;
  for (const group of groups) {
    if (!isRound(group.stage)) continue;
    highestIndex = Math.max(highestIndex, ROUND_ORDER.indexOf(group.stage));
  }

  const stageIndex = isRound(candidate.current_stage)
    ? ROUND_ORDER.indexOf(candidate.current_stage)
    : 0;
  const floor = Math.max(highestIndex, stageIndex, 0);

  const completedRounds = [
    ...new Set(
      groups
        .filter((group) => group.status === "COMPLETED")
        .map((group) => group.stage)
        .filter(isRound),
    ),
  ];

  return {
    floor,
    defaultRound: ROUND_ORDER[floor]!,
    selectable: [...ROUND_ORDER.slice(floor)],
    locked: [...ROUND_ORDER.slice(0, floor)],
    highestAttempted: highestIndex === -1 ? null : ROUND_ORDER[highestIndex]!,
    completedRounds,
  };
}

export type BookingMode = "SCHEDULE" | "RESCHEDULE";

export type RoundBookingState = {
  mode: BookingMode;
  existingRound: InterviewEventEntry | null;
  activeBooking: InterviewEventEntry | null;
  isRepeatOfCompletedRound: boolean;
};

export function resolveRoundBookingState(
  candidate: Pick<Candidate, "id" | "jobs">,
  interviews: Interview[],
  round: Round,
  now = Date.now(),
): RoundBookingState {
  const groups = groupCandidateInterviews(candidate, interviews).filter(
    (group) => group.status !== "CANCELLED",
  );
  const roundGroups = groups.filter((group) => group.stage === round);
  const existingRound =
    [...roundGroups].sort(
      (left, right) =>
        new Date(right.scheduled_start).getTime() - new Date(left.scheduled_start).getTime(),
    )[0] ?? null;
  // A round can have more than one live group; always target the earliest upcoming one.
  const activeBooking =
    roundGroups
      .filter(
        (group) => group.status === "SCHEDULED" && new Date(group.scheduled_start).getTime() > now,
      )
      .sort(
        (left, right) =>
          new Date(left.scheduled_start).getTime() - new Date(right.scheduled_start).getTime(),
      )[0] ?? null;

  return {
    mode: activeBooking ? "RESCHEDULE" : "SCHEDULE",
    existingRound,
    activeBooking,
    isRepeatOfCompletedRound: groups.some(
      (group) => group.stage === round && group.status === "COMPLETED",
    ),
  };
}

export function matchesCandidateSearch(candidate: Candidate, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [
    candidate.first_name,
    candidate.last_name,
    fullName(candidate),
    candidate.email,
    candidate.jobs?.title,
    candidate.jobs?.job_code,
  ].some((value) => value?.toLowerCase().includes(needle));
}

export type ActivityEntry = {
  id: string;
  candidate_id: string;
  action_type: string;
  details: Json;
  created_at: string;
};

export type FeedbackEntry = {
  id: string;
  interview_id: string;
  decision: string;
  overall_score: number;
  risk_level: string;
  submitted_at: string;
  interviews?: {
    stage: string;
    candidate_id: string;
    candidates?: { first_name: string; last_name: string } | null;
  } | null;
};

export function fullName(c: Pick<Candidate, "first_name" | "last_name">) {
  return `${c.first_name} ${c.last_name}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function daysInStage(candidate: Pick<Candidate, "status_updated_at">) {
  return Math.floor((Date.now() - new Date(candidate.status_updated_at).getTime()) / 86400000);
}

export function isSlaAtRisk(
  candidate: Pick<Candidate, "current_stage" | "status_updated_at">,
  t: SlaThresholds,
) {
  if (candidate.current_stage === "OFFER" || candidate.current_stage === "REJECTED") return false;
  return slaLevel(daysInStage(candidate), t) !== "ok";
}

const db = supabase;

export const appSettingsQuery = queryOptions({
  queryKey: ["app-settings"],
  queryFn: async (): Promise<AppSettings> => {
    const { data, error } = await db.from("app_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    return appSettingsFromRow(data);
  },
});

export const candidatesQuery = queryOptions({
  queryKey: ["candidates"],
  queryFn: async (): Promise<Candidate[]> => {
    const { data, error } = await db
      .from("candidates")
      .select(
        "*, jobs(id, job_code, title, department_id, department, location, status, departments(id, name, code))",
      )
      .order("status_updated_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Candidate[];
  },
});

export const departmentsQuery = queryOptions({
  queryKey: ["departments"],
  queryFn: async (): Promise<Department[]> => {
    const { data, error } = await db.from("departments").select("*").order("name");
    if (error) throw error;
    return (data ?? []) as Department[];
  },
});

export const jobsQuery = queryOptions({
  queryKey: ["jobs"],
  queryFn: async (): Promise<Job[]> => {
    const { data, error } = await db
      .from("jobs")
      .select("*, departments(*)")
      .order("open_since", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Job[];
  },
});

export const interviewersQuery = queryOptions({
  queryKey: ["interviewers"],
  queryFn: async (): Promise<Interviewer[]> => {
    const { data, error } = await db.from("interviewers").select("*").order("name");
    if (error) throw error;
    return (data ?? []) as Interviewer[];
  },
});

export const interviewsQuery = queryOptions({
  queryKey: ["interviews"],
  queryFn: async (): Promise<Interview[]> => {
    const { data, error } = await db
      .from("interviews")
      .select(
        "*, candidates(first_name, last_name, email, phone, source, current_stage), interviewers(name, title, email), jobs(id, job_code, title, department, location, status, departments(name, code))",
      )
      .order("scheduled_start");
    if (error) throw error;
    return (data ?? []) as Interview[];
  },
});

export const feedbackQuery = queryOptions({
  queryKey: ["feedback"],
  queryFn: async (): Promise<FeedbackEntry[]> => {
    const { data, error } = await db
      .from("interview_feedback")
      .select(
        "id, interview_id, decision, overall_score, risk_level, submitted_at, interviews(stage, candidate_id, candidates(first_name, last_name))",
      )
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as FeedbackEntry[];
  },
});

export const dashboardActivityQuery = queryOptions({
  queryKey: ["activity", "dashboard"],
  queryFn: async (): Promise<ActivityEntry[]> => {
    const { data, error } = await db
      .from("candidate_activity_log")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ActivityEntry[];
  },
});

export function activityQuery(candidateId: string | null) {
  return queryOptions({
    queryKey: ["activity", candidateId],
    enabled: !!candidateId,
    queryFn: async (): Promise<ActivityEntry[]> => {
      if (!candidateId) return [];

      const { data, error } = await db
        .from("candidate_activity_log")
        .select("*")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as ActivityEntry[];
    },
  });
}

function validTimestamp(value: string): number | null {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isSameLocalDay(iso: string, reference = new Date()) {
  const timestamp = validTimestamp(iso);
  if (timestamp === null) return false;
  const d = new Date(timestamp);
  return (
    d.getDate() === reference.getDate() &&
    d.getMonth() === reference.getMonth() &&
    d.getFullYear() === reference.getFullYear()
  );
}

export function isToday(iso: string) {
  return isSameLocalDay(iso);
}

export function isSameLocalMonth(iso: string, reference = new Date()) {
  const timestamp = validTimestamp(iso);
  if (timestamp === null) return false;
  const d = new Date(timestamp);
  return d.getMonth() === reference.getMonth() && d.getFullYear() === reference.getFullYear();
}

export function activityStageTarget(
  activity: ActivityEntry,
  includeInitialScreening = false,
): string | null {
  if (
    !activity.details ||
    typeof activity.details !== "object" ||
    Array.isArray(activity.details)
  ) {
    return null;
  }

  if (includeInitialScreening && activity.action_type === "APPLICATION_RECEIVED") {
    return activity.details["stage"] === "SCREENING" ? "SCREENING" : null;
  }
  if (activity.action_type !== "STAGE_CHANGED") return null;

  const target = activity.details["to"] ?? activity.details["to_stage"];
  return typeof target === "string" ? target : null;
}

export function countUniqueStageTransitionsOnLocalDay(
  activities: ActivityEntry[],
  stage: string,
  reference = new Date(),
) {
  return new Set(
    activities
      .filter(
        (activity) =>
          activityStageTarget(activity) === stage && isSameLocalDay(activity.created_at, reference),
      )
      .map((activity) => activity.candidate_id),
  ).size;
}

export function averageHiringCycleDays(activities: ActivityEntry[]): number | null {
  const byCandidate = new Map<string, ActivityEntry[]>();
  for (const activity of activities) {
    const candidateActivities = byCandidate.get(activity.candidate_id);
    if (candidateActivities) candidateActivities.push(activity);
    else byCandidate.set(activity.candidate_id, [activity]);
  }

  const cycles: number[] = [];
  for (const candidateActivities of byCandidate.values()) {
    const screeningAt = candidateActivities
      .filter((activity) => activityStageTarget(activity, true) === "SCREENING")
      .map((activity) => validTimestamp(activity.created_at))
      .filter((timestamp): timestamp is number => timestamp !== null)
      .sort((left, right) => left - right)[0];
    if (screeningAt === undefined) continue;

    const offerAt = candidateActivities
      .filter((activity) => activityStageTarget(activity) === "OFFER")
      .map((activity) => validTimestamp(activity.created_at))
      .filter((timestamp): timestamp is number => timestamp !== null && timestamp >= screeningAt)
      .sort((left, right) => left - right)[0];
    if (offerAt === undefined) continue;
    cycles.push((offerAt - screeningAt) / 86400000);
  }

  if (!cycles.length) return null;
  return Math.round(cycles.reduce((total, days) => total + days, 0) / cycles.length);
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

export async function logActivity(candidateId: string, actionType: string, details: Json) {
  await db.from("candidate_activity_log").insert({
    candidate_id: candidateId,
    action_type: actionType,
    details,
  });
}

export async function cancelScheduledInterviews(candidateIds: string[]) {
  if (!candidateIds.length) return;

  const { error } = await db
    .from("interviews")
    .update({ status: "CANCELLED" })
    .in("candidate_id", candidateIds)
    .eq("status", "SCHEDULED");
  if (error) throw error;
}

export async function rejectCandidate(
  candidate: Pick<Candidate, "id" | "current_stage">,
  reason: string,
) {
  const { error } = await db
    .from("candidates")
    .update({
      current_stage: "REJECTED",
      rejection_reason: reason,
      status_updated_at: new Date().toISOString(),
    })
    .eq("id", candidate.id);
  if (error) throw error;
  await cancelScheduledInterviews([candidate.id]);
  await logActivity(candidate.id, "STAGE_CHANGED", {
    from: candidate.current_stage,
    to: "REJECTED",
    reason,
  });
}

export async function rejectCandidates(
  candidates: Pick<Candidate, "id" | "current_stage">[],
  reason: string,
) {
  const ids = candidates.map((c) => c.id);
  const { error } = await db
    .from("candidates")
    .update({
      current_stage: "REJECTED",
      rejection_reason: reason,
      status_updated_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) throw error;
  await cancelScheduledInterviews(ids);
  // Rows are already updated; a logging failure shouldn't surface as a failed rejection.
  try {
    await Promise.all(
      candidates.map((c) =>
        logActivity(c.id, "STAGE_CHANGED", { from: c.current_stage, to: "REJECTED", reason }),
      ),
    );
  } catch (e) {
    console.warn("Failed to log rejection activity for one or more candidates", e);
  }
}

export async function unrejectCandidate(candidateId: string, newStage: Stage) {
  const { error } = await db
    .from("candidates")
    .update({
      current_stage: newStage,
      rejection_reason: null,
      status_updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);
  if (error) throw error;
  await logActivity(candidateId, "STAGE_CHANGED", { from: "REJECTED", to: newStage });
}
