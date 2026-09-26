/**
 * Structural PII redaction: emails, phone numbers, and social/LinkedIn profile
 * URLs pointing at individuals. Deterministic and cheap, run at extraction
 * time (before anything hits the manifest) and again as a safety-net pass in
 * save_report regardless of what the host LLM's synthesis did with names.
 *
 * Name redaction itself is NOT attempted here — per the project plan, that is
 * the host LLM's job during synthesis (it already reads all extracted text),
 * since a dedicated NER pass would be an extra LLM call this architecture
 * intentionally avoids. This module only ever strips structural identifiers.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

const PERSONAL_PROFILE_RE =
  /https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s)"'<>]+/gi;

export function redactStructuralPII(text: string): string {
  return text
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(PERSONAL_PROFILE_RE, "[redacted-profile]")
    .replace(PHONE_RE, "[redacted-phone]");
}

export const REDACTION_SYNTHESIS_GUIDANCE = `
When synthesizing findings into the report, redact identifying information
about individuals (reviewers, named employees/candidates mentioned in
complaints): replace full names of non-public individuals with a role
description (e.g. "a former recruiter"). Do NOT redact company names — that
defeats the report's purpose. Company executives named in a professional
context should default to redacted too, unless the user has explicitly opted
out of name redaction for this run (e.g. for legal/HR due diligence use).
Keep roles/titles ("a former recruiter said...") — only the identifying name
itself needs to go.
`.trim();
