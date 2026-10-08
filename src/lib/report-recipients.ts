const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
export const MAX_REPORT_RECIPIENTS = 50;

/** Normalize a comma- or semicolon-separated recipient list for Gmail MailApp. */
export function normalizeReportRecipients(value: string) {
  const recipients = [
    ...new Set(
      value
        .split(/[;,]/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (recipients.length === 0) {
    throw new Error("Enter at least one recipient email address.");
  }
  if (recipients.length > MAX_REPORT_RECIPIENTS) {
    throw new Error(`Enter no more than ${MAX_REPORT_RECIPIENTS} recipient email addresses.`);
  }
  if (recipients.some((email) => email.length > 254 || !EMAIL_PATTERN.test(email))) {
    throw new Error("Check the recipient list. Separate valid email addresses with commas.");
  }
  return recipients.join(", ");
}
