// Pure time helpers. LeetCode's calendar day is the UTC day, which starts at
// 05:30 AM IST (India has no daylight saving, so IST is always UTC+05:30).

export const DAY_MS = 86_400_000;
export const IST_OFFSET_MIN = 330;
export const DEFAULT_REMINDER_IST = "04:30";

/** Epoch ms of 00:00:00 UTC for the UTC day containing nowMs. */
export function utcDayStartMs(nowMs) {
  return Math.floor(nowMs / DAY_MS) * DAY_MS;
}

/** "YYYY-MM-DD" in UTC (never the browser's local date). */
export function utcDateString(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Epoch ms of the next LeetCode reset (next 00:00 UTC = 05:30 IST). */
export function nextResetMs(nowMs) {
  return utcDayStartMs(nowMs) + DAY_MS;
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** "HH:MM" -> minutes since midnight, or null if invalid. */
export function parseTimeOfDay(value) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * The instant, inside the UTC day starting at dayStartMs, at which the clock in
 * India shows `istMinutes`. Example: 04:30 IST -> 23:00 UTC of that same UTC day,
 * which is exactly one hour before that UTC day ends.
 */
export function reminderInstantForDay(dayStartMs, istMinutes) {
  const utcMin = (((istMinutes - IST_OFFSET_MIN) % 1440) + 1440) % 1440;
  return dayStartMs + utcMin * 60_000;
}

/** Next reminder strictly after nowMs, plus the UTC day it belongs to. */
export function nextReminder(nowMs, istMinutes) {
  let when = reminderInstantForDay(utcDayStartMs(nowMs), istMinutes);
  if (when <= nowMs) when += DAY_MS;
  return { when, targetDay: utcDateString(when) };
}

const istDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short", year: "numeric",
});
const istTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
});
const istStamp = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
});

export function formatIst(ms) {
  return { date: istDate.format(ms), time: istTime.format(ms).toUpperCase() };
}

export function formatIstStamp(ms) {
  return `${istStamp.format(ms).toUpperCase()} IST`;
}
