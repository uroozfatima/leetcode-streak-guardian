// Runs one status check end to end. Shared by the popup and the service worker.
import { fetchCalendar, fetchRecentAccepted } from "./leetcode.js";
import { deriveStatus, LABELS, TONES } from "./status.js";
import { utcDateString } from "./time.js";
import { getCache, getSettings, recordHistory, setCache } from "./storage.js";

export const MIN_INTERVAL_MS = 15_000; // avoids hammering LeetCode (rate limits)

/** Cached result, but only if it belongs to today's UTC day and this username. */
export async function getTodaysCache(nowMs = Date.now()) {
  const [cache, settings] = await Promise.all([getCache(), getSettings()]);
  if (!cache) return null;
  if (cache.utcDay !== utcDateString(nowMs)) return null; // invalidated at UTC rollover
  if (cache.username !== settings.username.trim()) return null;
  return cache;
}

export async function runCheck({ force = false, nowMs = Date.now(), fetchImpl } = {}) {
  const settings = await getSettings();
  const username = settings.username.trim();
  const utcDay = utcDateString(nowMs);

  if (!username) {
    return {
      status: "UNABLE", label: LABELS.UNABLE, tone: TONES.UNABLE, username: "", utcDay,
      checkedAt: nowMs, succeeded: false, lastSuccess: null,
      explanation: "Enter your LeetCode username in Settings so the extension knows which calendar to read.",
      details: { submissionsToday: null, acceptedToday: null, errors: [{ code: "NO_USERNAME", message: "No username set." }] },
    };
  }

  const cache = await getTodaysCache(nowMs);
  if (!force && cache && nowMs >= cache.checkedAt && nowMs - cache.checkedAt < MIN_INTERVAL_MS) return cache;

  const [calendar, accepted] = await Promise.all([
    fetchCalendar(username, nowMs, fetchImpl),
    fetchRecentAccepted(username, fetchImpl),
  ]);
  const derived = deriveStatus({ calendar, accepted, nowMs });
  const succeeded = derived.status !== "UNABLE";
  const lastSuccess = succeeded
    ? { status: derived.status, label: derived.label, checkedAt: nowMs }
    : cache?.lastSuccess ?? null;

  const result = { ...derived, username, utcDay, checkedAt: nowMs, succeeded, lastSuccess };
  await setCache(result);
  await recordHistory({ day: utcDay, status: derived.status, label: derived.label, tone: derived.tone, checkedAt: nowMs });
  return result;
}
