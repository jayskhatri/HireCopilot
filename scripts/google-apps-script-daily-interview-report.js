/* eslint-disable prettier/prettier */
/**
 * Free, Gmail-backed daily interview activity report sender for Google Apps Script.
 * Configure Script Properties documented in LOCAL-SETUP.md before running.
 */
function installDailyInterviewReportTrigger() {
  const config = getReportConfig_();
  replaceDailyTrigger_(config.hour, config.minute);
  console.log(
    `Daily report trigger installed for approximately ${String(config.hour).padStart(2, "0")}:${String(config.minute).padStart(2, "0")} (${config.timeZone}).`,
  );
}

/** Web-app endpoint called only by the authenticated HireCopilot server function. */
function doPost(event) {
  try {
    const payload = JSON.parse(event && event.postData ? event.postData.contents : "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("REPORT_WEBHOOK_SECRET");
    if (!expectedSecret || expectedSecret.length < 32 || payload.secret !== expectedSecret) {
      return jsonResponse_({ ok: false, error: "Unauthorized." });
    }

    if (payload.action === "schedule") {
      const recipient = String(payload.recipient || "").trim();
      const hour = Number(payload.hour);
      const minute = Number(payload.minute);
      const reportType = payload.reportType || "interviewDaily";
      const recipients = parseRecipients_(recipient);
      const normalizedRecipient = recipients.join(", ");
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw new Error("Hour must be between 0 and 23.");
      }
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
        throw new Error("Minute must be between 0 and 59.");
      }
      const properties = PropertiesService.getScriptProperties();
      const projectTimeZone = Session.getScriptTimeZone();
      const reportTimeZone = properties.getProperty("REPORT_TIME_ZONE") || projectTimeZone;
      if (reportTimeZone !== projectTimeZone) {
        throw new Error("REPORT_TIME_ZONE must match the Apps Script project time zone.");
      }
      if (reportType === "openPositions") {
        if (payload.frequency !== "daily" && payload.frequency !== "weekly") {
          throw new Error("Open positions frequency must be daily or weekly.");
        }
        const dayOfWeek = Number(payload.dayOfWeek);
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
          throw new Error("Choose a valid weekday.");
        }
        properties.setProperty("OPEN_POSITION_RECIPIENT", normalizedRecipient);
        properties.setProperty("OPEN_POSITION_HOUR", String(hour));
        properties.setProperty("OPEN_POSITION_MINUTE", String(minute));
        properties.setProperty("OPEN_POSITION_FREQUENCY", payload.frequency);
        properties.setProperty("OPEN_POSITION_DAY_OF_WEEK", String(dayOfWeek));
        replaceOpenPositionTrigger_(payload.frequency, dayOfWeek, hour, minute);
        return jsonResponse_({
          ok: true,
          reportType,
          scheduled: true,
          recipient: normalizedRecipient,
          hour,
          minute,
          frequency: payload.frequency,
          dayOfWeek,
          timeZone: projectTimeZone,
        });
      }
      if (reportType !== "interviewDaily") throw new Error("Unknown report type.");
      properties.setProperty("REPORT_RECIPIENT", normalizedRecipient);
      properties.setProperty("REPORT_HOUR", String(hour));
      properties.setProperty("REPORT_MINUTE", String(minute));
      replaceDailyTrigger_(hour, minute);
      return jsonResponse_({
        ok: true,
        reportType,
        scheduled: true,
        recipient: normalizedRecipient,
        hour,
        minute,
        timeZone: projectTimeZone,
      });
    }

    if (payload.action === "cancel") {
      const reportType = payload.reportType || "interviewDaily";
      const properties = PropertiesService.getScriptProperties();
      if (reportType === "openPositions") {
        ScriptApp.getProjectTriggers()
          .filter((trigger) => trigger.getHandlerFunction() === "sendOpenPositionsReport")
          .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
        [
          "OPEN_POSITION_RECIPIENT",
          "OPEN_POSITION_HOUR",
          "OPEN_POSITION_MINUTE",
          "OPEN_POSITION_FREQUENCY",
          "OPEN_POSITION_DAY_OF_WEEK",
        ].forEach((key) => properties.deleteProperty(key));
      } else {
        ScriptApp.getProjectTriggers()
          .filter((trigger) => trigger.getHandlerFunction() === "sendDailyInterviewReport")
          .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
        properties.deleteProperty("REPORT_RECIPIENT");
      }
      return jsonResponse_({ ok: true, reportType, scheduled: false });
    }

    if (payload.action === "status") {
      const properties = PropertiesService.getScriptProperties();
      if (payload.reportType === "openPositions") {
        const trigger = ScriptApp.getProjectTriggers().find(
          (item) => item.getHandlerFunction() === "sendOpenPositionsReport",
        );
        return jsonResponse_({
          ok: true,
          reportType: "openPositions",
          scheduled: Boolean(trigger),
          recipient: properties.getProperty("OPEN_POSITION_RECIPIENT") || "",
          hour: Number(properties.getProperty("OPEN_POSITION_HOUR") || "9"),
          minute: Number(properties.getProperty("OPEN_POSITION_MINUTE") || "0"),
          frequency: properties.getProperty("OPEN_POSITION_FREQUENCY") || "daily",
          dayOfWeek: Number(properties.getProperty("OPEN_POSITION_DAY_OF_WEEK") || "1"),
          timeZone: Session.getScriptTimeZone(),
        });
      }
      const trigger = ScriptApp.getProjectTriggers().find(
        (item) => item.getHandlerFunction() === "sendDailyInterviewReport",
      );
      return jsonResponse_({
        ok: true,
        reportType: "interviewDaily",
        scheduled: Boolean(trigger),
        recipient: properties.getProperty("REPORT_RECIPIENT") || "",
        hour: Number(properties.getProperty("REPORT_HOUR") || "9"),
        minute: Number(properties.getProperty("REPORT_MINUTE") || "0"),
        timeZone: Session.getScriptTimeZone(),
      });
    }

    if (payload.action === "sendNow") {
      const recipient = String(payload.recipient || "").trim();
      const normalizedRecipient = parseRecipients_(recipient).join(", ");
      if (payload.reportType === "openPositions") {
        const properties = PropertiesService.getScriptProperties();
        const scheduledRecipient = properties.getProperty("OPEN_POSITION_RECIPIENT");
        properties.setProperty("OPEN_POSITION_RECIPIENT", normalizedRecipient);
        try {
          sendOpenPositionsReport();
        } finally {
          if (scheduledRecipient) properties.setProperty("OPEN_POSITION_RECIPIENT", scheduledRecipient);
          else properties.deleteProperty("OPEN_POSITION_RECIPIENT");
        }
        return jsonResponse_({ ok: true, reportType: "openPositions", sent: true });
      }
      const reportDate = String(payload.reportDate || "");
      if (!isValidDate_(reportDate)) throw new Error("Provide a valid report date.");
      const properties = PropertiesService.getScriptProperties();
      const scheduledRecipient = properties.getProperty("REPORT_RECIPIENT");
      properties.setProperty("REPORT_RECIPIENT", normalizedRecipient);
      try {
        sendInterviewReportForDate_(reportDate);
      } finally {
        if (scheduledRecipient) properties.setProperty("REPORT_RECIPIENT", scheduledRecipient);
        else properties.deleteProperty("REPORT_RECIPIENT");
      }
      return jsonResponse_({ ok: true, reportType: "interviewDaily", sent: true });
    }

    throw new Error("Unknown action.");
  } catch (error) {
    const message = error && error.message ? error.message : "Request failed.";
    return jsonResponse_({ ok: false, error: message });
  }
}

function replaceDailyTrigger_(hour, minute) {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "sendDailyInterviewReport")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("sendDailyInterviewReport")
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .nearMinute(minute)
    .create();
}

function replaceOpenPositionTrigger_(frequency, dayOfWeek, hour, minute) {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "sendOpenPositionsReport")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  const builder = ScriptApp.newTrigger("sendOpenPositionsReport").timeBased();
  if (frequency === "weekly") {
    const weekdays = [
      ScriptApp.WeekDay.SUNDAY,
      ScriptApp.WeekDay.MONDAY,
      ScriptApp.WeekDay.TUESDAY,
      ScriptApp.WeekDay.WEDNESDAY,
      ScriptApp.WeekDay.THURSDAY,
      ScriptApp.WeekDay.FRIDAY,
      ScriptApp.WeekDay.SATURDAY,
    ];
    builder.onWeekDay(weekdays[dayOfWeek]);
  } else {
    builder.everyDays(1);
  }
  builder.atHour(hour).nearMinute(minute).create();
}

function jsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Manually run once to test delivery for the previous local calendar day. */
function sendDailyInterviewReportNow() {
  sendDailyInterviewReport();
}

/** Trigger handler: send the previous local calendar day's interview report. */
function sendDailyInterviewReport() {
  const config = getReportConfig_();
  sendInterviewReportForDate_(previousLocalDate_(config.timeZone));
}

function sendInterviewReportForDate_(reportDate) {
  const config = getReportConfig_();
  if (MailApp.getRemainingDailyQuota() < config.recipientCount) {
    throw new Error(`Gmail quota is too low to send to all ${config.recipientCount} recipients today.`);
  }

  const range = localDateRange_(reportDate, config.timeZone);
  const interviews = fetchRows_(config, "interviews", [
    [
      "select",
      "id,booking_group_id,candidate_id,job_id,interviewer_id,stage,scheduled_start,status",
    ],
    ["scheduled_start", `gte.${range.start.toISOString()}`],
    ["scheduled_start", `lt.${range.end.toISOString()}`],
    ["status", "in.(SCHEDULED,COMPLETED)"],
    ["order", "scheduled_start.asc"],
  ]);
  const rejected = fetchRows_(config, "candidates", [
    [
      "select",
      "id,first_name,last_name,email,phone,source,job_id,current_stage,status_updated_at,rejection_reason",
    ],
    ["current_stage", "eq.REJECTED"],
    ["status_updated_at", `gte.${range.start.toISOString()}`],
    ["status_updated_at", `lt.${range.end.toISOString()}`],
    ["order", "status_updated_at.asc"],
  ]);

  const candidateIds = unique_([
    ...interviews.map((row) => row.candidate_id),
    ...rejected.map((row) => row.id),
  ]);
  const jobIds = unique_([
    ...interviews.map((row) => row.job_id),
    ...rejected.map((row) => row.job_id),
  ]);
  const interviewerIds = unique_(interviews.map((row) => row.interviewer_id));
  const [candidates, jobs, interviewers] = [
    fetchByIds_(config, "candidates", candidateIds, "id,first_name,last_name,email,phone,source"),
    fetchByIds_(config, "jobs", jobIds, "id,title,job_code,department"),
    fetchByIds_(config, "interviewers", interviewerIds, "id,name,email"),
  ];
  const candidateById = indexBy_(candidates, "id");
  const jobById = indexBy_(jobs, "id");
  const interviewerById = indexBy_(interviewers, "id");
  const interviewGroups = new Map();
  interviews.forEach((interview) => {
    const groupId = interview.booking_group_id || interview.id;
    if (!interviewGroups.has(groupId)) interviewGroups.set(groupId, []);
    interviewGroups.get(groupId).push(interview);
  });

  const rows = [[
    "Activity",
    "Date/time",
    "Candidate",
    "Candidate email",
    "Phone",
    "Role",
    "Stage",
    "Status",
    "Interviewer(s)",
    "Interviewer email(s)",
    "Source",
    "Rejection reason",
  ]];
  interviewGroups.forEach((group) => {
    const first = group[0];
    const candidate = candidateById.get(first.candidate_id) || {};
    const job = jobById.get(first.job_id) || {};
    const panel = group
      .map((interview) => interviewerById.get(interview.interviewer_id))
      .filter(Boolean);
    rows.push([
      first.status === "SCHEDULED" ? "Interview scheduled" : "Interview completed",
      Utilities.formatDate(new Date(first.scheduled_start), config.timeZone, "yyyy-MM-dd HH:mm"),
      fullName_(candidate),
      candidate.email || "",
      candidate.phone || "",
      job.title || "Unassigned",
      first.stage,
      first.status,
      unique_(panel.map((person) => person.name)).join(", "),
      unique_(panel.map((person) => person.email)).join(", "),
      candidate.source || "",
      "",
    ]);
  });
  rejected.forEach((candidate) => {
    const job = jobById.get(candidate.job_id) || {};
    rows.push([
      "Candidate rejected",
      Utilities.formatDate(new Date(candidate.status_updated_at), config.timeZone, "yyyy-MM-dd HH:mm"),
      fullName_(candidate),
      candidate.email || "",
      candidate.phone || "",
      job.title || "Unassigned",
      "Rejected",
      "REJECTED",
      "",
      "",
      candidate.source || "",
      candidate.rejection_reason || "",
    ]);
  });

  const scheduledCount = rows.filter((row) => row[0] === "Interview scheduled").length;
  const completedCount = rows.filter((row) => row[0] === "Interview completed").length;
  const rejectedCount = rows.filter((row) => row[0] === "Candidate rejected").length;
  const fileName = `hirecopilot-interview-activity-${reportDate}.csv`;
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell_).join(",")).join("\r\n");
  MailApp.sendEmail({
    to: config.recipient,
    subject: `HireCopilot daily interview report — ${reportDate}`,
    body: [
      `Interview activity report for ${reportDate}.`,
      `Scheduled interviews: ${scheduledCount}`,
      `Completed interviews: ${completedCount}`,
      `Candidates rejected: ${rejectedCount}`,
      "The detailed CSV report is attached.",
    ].join("\n"),
    attachments: [Utilities.newBlob(csv, "text/csv;charset=utf-8", fileName)],
    name: "HireCopilot Reports",
  });
  console.log(
    `Sent ${fileName} to ${config.recipient}: ${scheduledCount} scheduled, ${completedCount} completed, ${rejectedCount} rejected.`,
  );
}

/** Time-driven handler for the independent open positions email schedule. */
function sendOpenPositionsReport() {
  const recipient = PropertiesService.getScriptProperties().getProperty("OPEN_POSITION_RECIPIENT");
  if (!recipient) throw new Error("Set the open-position report recipient from the Reports page.");
  sendOpenPositionsReportTo_(recipient.trim());
}

function sendOpenPositionsReportTo_(recipient) {
  const config = getReportConfig_(recipient);
  if (MailApp.getRemainingDailyQuota() < config.recipientCount) {
    throw new Error(`Gmail quota is too low to send to all ${config.recipientCount} recipients today.`);
  }
  const jobs = fetchRows_(config, "jobs", [
    ["select", "id,job_code,title,department,location,required_skills,open_since,status"],
    ["status", "eq.OPEN"],
    ["order", "open_since.desc"],
  ]);
  const jobIds = jobs.map((job) => job.id);
  const candidates = jobIds.length
    ? fetchRows_(config, "candidates", [
        ["select", "job_id"],
        ["job_id", `in.(${jobIds.join(",")})`],
      ])
    : [];
  const counts = new Map();
  candidates.forEach((candidate) => {
    if (candidate.job_id) counts.set(candidate.job_id, (counts.get(candidate.job_id) || 0) + 1);
  });
  const rows = [[
    "Job code",
    "Position",
    "Department",
    "Location",
    "Required skills",
    "Assigned candidates",
    "Opened",
  ]];
  jobs.forEach((job) => rows.push([
    job.job_code || "",
    job.title || "",
    job.department || "",
    job.location || "",
    (job.required_skills || []).join(", "),
    counts.get(job.id) || 0,
    job.open_since
      ? Utilities.formatDate(new Date(job.open_since), config.timeZone, "yyyy-MM-dd")
      : "",
  ]));
  const reportDate = Utilities.formatDate(new Date(), config.timeZone, "yyyy-MM-dd");
  const fileName = `hirecopilot-open-positions-${reportDate}.csv`;
  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell_).join(",")).join("\r\n");
  MailApp.sendEmail({
    to: recipient,
    subject: `HireCopilot open positions report — ${reportDate}`,
    body: [
      `Open positions report for ${reportDate}.`,
      `Open positions: ${jobs.length}`,
      `Candidates assigned to open positions: ${candidates.length}`,
      "The detailed CSV report is attached.",
    ].join("\n"),
    attachments: [Utilities.newBlob(csv, "text/csv;charset=utf-8", fileName)],
    name: "HireCopilot Reports",
  });
  console.log(`Sent ${fileName} to ${recipient}: ${jobs.length} open positions.`);
}

function getReportConfig_(recipientOverride) {
  const properties = PropertiesService.getScriptProperties();
  const supabaseUrl = (properties.getProperty("SUPABASE_URL") || "").replace(/\/$/, "");
  const publishableKey = properties.getProperty("SUPABASE_PUBLISHABLE_KEY") || "";
  const recipient = (recipientOverride || properties.getProperty("REPORT_RECIPIENT") || "").trim();
  const projectTimeZone = Session.getScriptTimeZone();
  const timeZone = properties.getProperty("REPORT_TIME_ZONE") || projectTimeZone;
  const hour = Number(properties.getProperty("REPORT_HOUR") || "9");
  const minute = Number(properties.getProperty("REPORT_MINUTE") || "0");
  if (!/^https:\/\//.test(supabaseUrl)) throw new Error("Set SUPABASE_URL in Script Properties.");
  if (!publishableKey) throw new Error("Set SUPABASE_PUBLISHABLE_KEY in Script Properties.");
  if (timeZone !== projectTimeZone) {
    throw new Error("REPORT_TIME_ZONE must match the Apps Script project time zone.");
  }
  if (publishableKey.startsWith("sb_secret_")) {
    throw new Error("Use a publishable/anon key only; never put a Supabase secret key in this script.");
  }
  const recipients = parseRecipients_(recipient);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("REPORT_HOUR must be an integer from 0 to 23.");
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("REPORT_MINUTE must be an integer from 0 to 59.");
  }
  return { supabaseUrl, publishableKey, recipient: recipients.join(", "), recipientCount: recipients.length, timeZone, hour, minute };
}

function parseRecipients_(value) {
  const recipients = [...new Set(String(value || "").split(/[;,]/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) throw new Error("Provide at least one report recipient email address.");
  if (recipients.length > 50) throw new Error("Provide no more than 50 report recipients.");
  if (recipients.some((email) => email.length > 254 || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email))) {
    throw new Error("Check the recipient list. Separate valid email addresses with commas.");
  }
  return recipients;
}

function fetchRows_(config, table, parameters) {
  const query = parameters
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const response = UrlFetchApp.fetch(`${config.supabaseUrl}/rest/v1/${table}?${query}`, {
    method: "get",
    headers: {
      apikey: config.publishableKey,
      ...(config.publishableKey.startsWith("sb_publishable_")
        ? {}
        : { Authorization: `Bearer ${config.publishableKey}` }),
      Accept: "application/json",
    },
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`Supabase read failed for ${table} (HTTP ${status}): ${response.getContentText().slice(0, 300)}`);
  }
  return JSON.parse(response.getContentText());
}

function fetchByIds_(config, table, ids, columns) {
  if (!ids.length) return [];
  return fetchRows_(config, table, [
    ["select", columns],
    ["id", `in.(${ids.join(",")})`],
  ]);
}

function localDateRange_(dateString, timeZone) {
  const nextDate = shiftDate_(dateString, 1);
  return {
    start: Utilities.parseDate(`${dateString} 00:00:00`, timeZone, "yyyy-MM-dd HH:mm:ss"),
    end: Utilities.parseDate(`${nextDate} 00:00:00`, timeZone, "yyyy-MM-dd HH:mm:ss"),
  };
}

function previousLocalDate_(timeZone) {
  const today = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd");
  return shiftDate_(today, -1);
}

function shiftDate_(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function isValidDate_(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return shiftDate_(value, 0) === value;
}

function unique_(values) {
  return [...new Set(values.filter(Boolean))];
}

function indexBy_(rows, key) {
  return new Map(rows.map((row) => [row[key], row]));
}

function fullName_(person) {
  return [person.first_name, person.last_name].filter(Boolean).join(" ") || "Candidate";
}

function csvCell_(value) {
  const text = value == null ? "" : String(value);
  const safe = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
