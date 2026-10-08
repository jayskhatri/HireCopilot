import type { Database } from "@/integrations/supabase/types";

type AppSettingsRow = Database["public"]["Tables"]["app_settings"]["Row"];
type AppSettingsUpdate = Database["public"]["Tables"]["app_settings"]["Update"];

export type AppSettings = {
  slaWarningDays: number;
  slaBreachDays: number;
  autoSchedule: boolean;
  aiRiskAnalysis: boolean;
  teamsReminders: boolean;
  weeklyDigest: boolean;
};

export type SlaThresholds = Pick<AppSettings, "slaWarningDays" | "slaBreachDays">;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  slaWarningDays: 3,
  slaBreachDays: 5,
  autoSchedule: true,
  aiRiskAnalysis: true,
  teamsReminders: true,
  weeklyDigest: false,
};

export function validateSlaThresholds(t: SlaThresholds): string | null {
  if (!Number.isInteger(t.slaWarningDays) || !Number.isInteger(t.slaBreachDays)) {
    return "SLA thresholds must be whole numbers of days.";
  }
  if (t.slaWarningDays < 1 || t.slaWarningDays > 90) {
    return "Amber warning must be between 1 and 90 days.";
  }
  if (t.slaBreachDays <= t.slaWarningDays) {
    return "Red breach must be later than the amber warning.";
  }
  if (t.slaBreachDays > 180) {
    return "Red breach must be 180 days or fewer.";
  }
  return null;
}

function boolOr(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function appSettingsFromRow(row: Partial<AppSettingsRow> | null | undefined): AppSettings {
  if (!row) return DEFAULT_APP_SETTINGS;
  const thresholds: SlaThresholds = {
    slaWarningDays: Number(row.sla_warning_days),
    slaBreachDays: Number(row.sla_breach_days),
  };
  const validThresholds = validateSlaThresholds(thresholds) === null;
  return {
    slaWarningDays: validThresholds
      ? thresholds.slaWarningDays
      : DEFAULT_APP_SETTINGS.slaWarningDays,
    slaBreachDays: validThresholds ? thresholds.slaBreachDays : DEFAULT_APP_SETTINGS.slaBreachDays,
    autoSchedule: boolOr(row.auto_schedule, DEFAULT_APP_SETTINGS.autoSchedule),
    aiRiskAnalysis: boolOr(row.ai_risk_analysis, DEFAULT_APP_SETTINGS.aiRiskAnalysis),
    teamsReminders: boolOr(row.teams_reminders, DEFAULT_APP_SETTINGS.teamsReminders),
    weeklyDigest: boolOr(row.weekly_digest, DEFAULT_APP_SETTINGS.weeklyDigest),
  };
}

export function appSettingsToRow(settings: AppSettings): AppSettingsUpdate {
  return {
    sla_warning_days: settings.slaWarningDays,
    sla_breach_days: settings.slaBreachDays,
    auto_schedule: settings.autoSchedule,
    ai_risk_analysis: settings.aiRiskAnalysis,
    teams_reminders: settings.teamsReminders,
    weekly_digest: settings.weeklyDigest,
  };
}

export type SlaLevel = "ok" | "warning" | "breach";

export function slaLevel(days: number, t: SlaThresholds = DEFAULT_APP_SETTINGS): SlaLevel {
  if (days > t.slaBreachDays) return "breach";
  if (days > t.slaWarningDays) return "warning";
  return "ok";
}

export function slaBucketLabels(t: SlaThresholds) {
  const w = t.slaWarningDays;
  const b = t.slaBreachDays;
  return {
    "on-track": `On track (0–${w} days)`,
    warning: `Warning (${w + 1}–${b} days)`,
    breach: `Breach (${b + 1}+ days)`,
  };
}
