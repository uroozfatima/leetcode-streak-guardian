// Thin wrapper over chrome.storage.local. Stores only settings and status results.
// Never stores passwords, cookies, or tokens.
export const DEFAULT_SETTINGS = {
  username: "",
  reminderEnabled: true,
  reminderTime: "04:30", // India time (IST)
};
const HISTORY_DAYS = 14;
const RANK = { COMPLETED: 4, ACTIVITY_DETECTED: 3, NOT_COMPLETED: 2, NO_ACTIVITY: 2, UNABLE: 0 };

export const isValidUsername = (u) => /^[A-Za-z0-9_-]{1,40}$/.test(String(u ?? "").trim());

async function read(key, fallback) {
  const out = await chrome.storage.local.get(key);
  return out[key] ?? fallback;
}

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await read("settings", {})) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export const getCache = () => read("cache", null);
export const setCache = (cache) => chrome.storage.local.set({ cache });
export const getReminderState = () => read("reminderState", { lastReminderDay: null });
export const setReminderState = (reminderState) => chrome.storage.local.set({ reminderState });
export const getHistory = () => read("history", []);

/** One entry per UTC day. A failed check never overwrites a successful one. */
export async function recordHistory(entry) {
  const history = await getHistory();
  const idx = history.findIndex((h) => h.day === entry.day);
  if (idx >= 0) {
    const old = history[idx];
    if (entry.status === "UNABLE" && RANK[old.status] > 0) return history;
    history[idx] = entry;
  } else {
    history.push(entry);
  }
  history.sort((a, b) => (a.day < b.day ? 1 : -1));
  const trimmed = history.slice(0, HISTORY_DAYS);
  await chrome.storage.local.set({ history: trimmed });
  return trimmed;
}
