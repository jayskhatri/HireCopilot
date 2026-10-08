import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeReportRecipients } from "@/lib/report-recipients";

export type ConfigureGoogleReportInput =
  | {
      action: "schedule";
      reportType?: "interviewDaily";
      recipient: string;
      time: string;
    }
  | {
      action: "schedule";
      reportType: "openPositions";
      recipient: string;
      time: string;
      frequency: "daily" | "weekly";
      dayOfWeek: number;
    }
  | { action: "cancel"; reportType?: "interviewDaily" | "openPositions" }
  | {
      action: "sendNow";
      reportType?: "interviewDaily";
      recipient: string;
      reportDate: string;
    }
  | { action: "sendNow"; reportType: "openPositions"; recipient: string }
  | { action: "status"; reportType?: "interviewDaily" | "openPositions" };

function validateInput(input: ConfigureGoogleReportInput): ConfigureGoogleReportInput {
  if (!input || !["schedule", "cancel", "sendNow", "status"].includes(input.action)) {
    throw new Error("Unsupported report action.");
  }
  if (input.reportType && !["interviewDaily", "openPositions"].includes(input.reportType)) {
    throw new Error("Unsupported report type.");
  }
  if (input.action === "schedule" || input.action === "sendNow") {
    if (typeof input.recipient !== "string") {
      throw new Error("Enter at least one recipient email address.");
    }
    normalizeReportRecipients(input.recipient);
    if (
      input.action === "sendNow" &&
      input.reportType !== "openPositions" &&
      !/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate)
    ) {
      throw new Error("Choose a valid report date for the test send.");
    }
    if (input.action === "schedule" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) {
      throw new Error("Choose a valid local schedule time.");
    }
    if (input.action === "schedule" && input.reportType === "openPositions") {
      if (input.frequency !== "daily" && input.frequency !== "weekly") {
        throw new Error("Choose a daily or weekly open positions schedule.");
      }
      if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) {
        throw new Error("Choose a valid weekday.");
      }
    }
  }
  return input;
}

async function callGoogleAppsScript(
  action: ConfigureGoogleReportInput["action"],
  context: { claims: Record<string, unknown> },
  input: ConfigureGoogleReportInput,
) {
  const url = process.env["GOOGLE_APPS_SCRIPT_WEB_APP_URL"];
  const secret = process.env["GOOGLE_APPS_SCRIPT_WEBHOOK_SECRET"];
  const allowedOperators = (process.env["REPORT_ALLOWED_OPERATORS"] ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const operatorEmail = String(context.claims["email"] ?? "")
    .trim()
    .toLowerCase();
  if (!url || !secret) {
    throw new Error(
      "Automatic Gmail reporting is not configured. Set GOOGLE_APPS_SCRIPT_WEB_APP_URL and GOOGLE_APPS_SCRIPT_WEBHOOK_SECRET on the server.",
    );
  }
  if (secret.length < 32) {
    throw new Error(
      "GOOGLE_APPS_SCRIPT_WEBHOOK_SECRET must be at least 32 characters and match the private Apps Script property.",
    );
  }
  let deploymentUrl: URL;
  try {
    deploymentUrl = new URL(url);
  } catch {
    throw new Error(
      "GOOGLE_APPS_SCRIPT_WEB_APP_URL must be the deployed HTTPS URL ending in /exec.",
    );
  }
  if (
    deploymentUrl.protocol !== "https:" ||
    deploymentUrl.hostname !== "script.google.com" ||
    !/^\/macros\/s\/[^/]+\/exec\/?$/.test(deploymentUrl.pathname)
  ) {
    throw new Error(
      "GOOGLE_APPS_SCRIPT_WEB_APP_URL must be the actual Google Apps Script deployment URL ending in /exec, not a placeholder or editor link.",
    );
  }
  if (!allowedOperators.length || !allowedOperators.includes(operatorEmail)) {
    throw new Error("Sign in with an approved report operator account to manage automatic emails.");
  }

  const data = {
    ...input,
    action,
    secret,
    ...(input.action === "schedule"
      ? {
          hour: Number(input.time.slice(0, 2)),
          minute: Number(input.time.slice(3, 5)),
          recipient: normalizeReportRecipients(input.recipient),
          ...(input.reportType === "openPositions"
            ? { frequency: input.frequency, dayOfWeek: input.dayOfWeek }
            : {}),
        }
      : input.action === "sendNow"
        ? {
            recipient: normalizeReportRecipients(input.recipient),
            ...(input.reportType === "openPositions" ? {} : { reportDate: input.reportDate }),
          }
        : {}),
  };
  type AppsScriptResult = {
    ok?: boolean;
    error?: string;
    sent?: boolean;
    scheduled?: boolean;
    recipient?: string;
    hour?: number;
    minute?: number;
    timeZone?: string;
    frequency?: "daily" | "weekly";
    dayOfWeek?: number;
    reportType?: "interviewDaily" | "openPositions";
  };

  async function postToAppsScript(payload: object): Promise<AppsScriptResult> {
    const response = await fetch(deploymentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    const responseText = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Google Apps Script denied the web-app request. Redeploy it as a Web app with 'Execute as me' and access set to 'Anyone', then copy the new /exec URL into GOOGLE_APPS_SCRIPT_WEB_APP_URL. If your Google Workspace blocks public web apps, deploy it from a personal Gmail account instead.",
      );
    }
    if (response.status === 404) {
      throw new Error(
        "Google Apps Script deployment was not found. Deploy a new Web app version and update GOOGLE_APPS_SCRIPT_WEB_APP_URL with its /exec URL.",
      );
    }
    let result: AppsScriptResult;
    try {
      result = JSON.parse(responseText) as AppsScriptResult;
    } catch {
      throw new Error(
        `Google Apps Script returned an unexpected response (HTTP ${response.status}). Check that its web app is deployed and accessible.`,
      );
    }
    if (!response.ok || !result.ok) {
      if (/unknown action/i.test(result.error ?? "")) {
        const rejectedAction =
          "action" in payload && typeof payload.action === "string" ? payload.action : "requested";
        throw new Error(
          `The configured Google Apps Script deployment rejected the "${rejectedAction}" action. Confirm GOOGLE_APPS_SCRIPT_WEB_APP_URL belongs to the Apps Script project whose code includes the status handler, then deploy a new Web app version of scripts/google-apps-script-daily-interview-report.js. Update GOOGLE_APPS_SCRIPT_WEB_APP_URL only if you changed deployments.`,
        );
      }
      throw new Error(result.error || `Google Apps Script failed (HTTP ${response.status}).`);
    }
    const expectedReportType = input.reportType ?? "interviewDaily";
    if (result.reportType !== expectedReportType) {
      throw new Error(
        `The deployed Google Apps Script does not confirm the ${expectedReportType === "openPositions" ? "open positions" : "interview activity"} report. Update its code with scripts/google-apps-script-daily-interview-report.js and deploy a new Web app version before continuing.`,
      );
    }
    return result;
  }

  const expectedReportType = input.reportType ?? "interviewDaily";
  if (action !== "status") {
    await postToAppsScript({ action: "status", reportType: expectedReportType, secret });
  }
  const result = await postToAppsScript(data);
  return result;
}

export const configureGoogleDailyInterviewReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateInput)
  .handler(async ({ data, context }) => callGoogleAppsScript(data.action, context, data));
