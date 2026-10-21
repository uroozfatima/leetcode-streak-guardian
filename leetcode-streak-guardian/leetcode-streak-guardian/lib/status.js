// Pure logic that turns LeetCode API results into a user-facing status.
import { utcDayStartMs } from "./time.js";

export const LABELS = {
  COMPLETED: "COMPLETED",
  NOT_COMPLETED: "NOT COMPLETED",
  ACTIVITY_DETECTED: "ACTIVITY DETECTED",
  NO_ACTIVITY: "NO ACTIVITY DETECTED",
  UNABLE: "UNABLE TO VERIFY",
};

export const TONES = {
  COMPLETED: "ok",
  ACTIVITY_DETECTED: "ok",
  NOT_COMPLETED: "bad",
  NO_ACTIVITY: "bad",
  UNABLE: "warn",
};

/** Sum calendar counts whose timestamp falls inside the UTC day. */
export function countSubmissionsForDay(calendar, dayStartMs) {
  const start = dayStartMs / 1000;
  const end = start + 86_400;
  let total = 0;
  for (const [key, value] of Object.entries(calendar || {})) {
    const ts = Number(key);
    const count = Number(value);
    if (Number.isFinite(ts) && Number.isFinite(count) && ts >= start && ts < end) total += count;
  }
  return total;
}

/** Count accepted submissions (epoch-second timestamps) inside the UTC day. */
export function countAcceptedForDay(list, dayStartMs) {
  const start = dayStartMs / 1000;
  const end = start + 86_400;
  return (list || []).filter((item) => {
    const ts = Number(item?.timestamp);
    return Number.isFinite(ts) && ts >= start && ts < end;
  }).length;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * calendar / accepted are { ok:true, data } or { ok:false, error:{code,message} }.
 * A failed request can NEVER produce NOT_COMPLETED or NO_ACTIVITY.
 */
export function deriveStatus({ calendar, accepted, nowMs }) {
  const dayStart = utcDayStartMs(nowMs);
  const submissionsToday = calendar?.ok ? countSubmissionsForDay(calendar.data, dayStart) : null;
  const acceptedToday = accepted?.ok ? countAcceptedForDay(accepted.data, dayStart) : null;
  const errors = [calendar, accepted].filter((r) => r && !r.ok).map((r) => r.error);
  const details = { submissionsToday, acceptedToday, errors };

  const make = (status, explanation) => ({
    status, label: LABELS[status], tone: TONES[status], explanation, details,
  });

  const invalid = errors.find((e) => e.code === "INVALID_USERNAME");
  if (invalid) {
    return make("UNABLE", `${invalid.message} Check the spelling of your username in Settings.`);
  }

  // Best case: accepted-submission list is available, so we can be precise.
  if (accepted?.ok) {
    if (acceptedToday > 0) {
      return make("COMPLETED",
        `Found ${plural(acceptedToday, "accepted submission")} dated today (UTC). Today's LeetCode calendar day is covered.`);
    }
    if (submissionsToday > 0) {
      return make("NOT_COMPLETED",
        `The calendar shows ${plural(submissionsToday, "submission")} today, but none were accepted. Solve a problem before the reset. If you just submitted, wait a minute and check again.`);
    }
    return make("NOT_COMPLETED",
      "No accepted submission found for today (UTC). Solve a problem before the reset. If you just submitted, wait a minute and check again.");
  }

  // Fallback: only the calendar worked. It cannot prove a submission was accepted.
  if (calendar?.ok) {
    if (submissionsToday > 0) {
      return make("ACTIVITY_DETECTED",
        `The calendar shows ${plural(submissionsToday, "submission")} today, but the accepted-submissions check failed, so acceptance is not verified.`);
    }
    return make("NO_ACTIVITY",
      "The calendar shows no submissions for today (UTC). The accepted-submissions check was unavailable, but no activity at all means nothing was accepted.");
  }

  const reason = errors.map((e) => e.message).filter(Boolean)[0] || "LeetCode did not return usable data.";
  return make("UNABLE",
    `${reason} This does not mean your day is empty. Use Check now to try again, or open LeetCode to look.`);
}
