// Service worker: schedules reminders and shows notifications.
// MV3 service workers sleep, so all state lives in chrome.storage / chrome.alarms.
import { runCheck } from "./lib/checker.js";
import { getReminderState, getSettings, setReminderState } from "./lib/storage.js";
import {
  DEFAULT_REMINDER_IST, nextReminder, parseTimeOfDay, reminderInstantForDay,
  utcDateString, utcDayStartMs,
} from "./lib/time.js";

const ALARM_PREFIX = "reminder:";   // full name: reminder:<UTC day the reminder is for>
const HEARTBEAT = "heartbeat";      // safety net: re-checks schedule + catches missed reminders
const LEETCODE_URL = "https://leetcode.com/problemset/";
let reminderInFlight = false;

const istMinutes = (settings) => parseTimeOfDay(settings.reminderTime) ?? parseTimeOfDay(DEFAULT_REMINDER_IST);

async function clearReminderAlarms() {
  for (const alarm of await chrome.alarms.getAll()) {
    if (alarm.name.startsWith(ALARM_PREFIX)) await chrome.alarms.clear(alarm.name);
  }
}

/** Create the next one-shot reminder alarm. Always recomputed from the current clock. */
async function scheduleReminder({ suppressTodayIfPassed = false } = {}) {
  const settings = await getSettings();
  await clearReminderAlarms();
  if (!settings.reminderEnabled) return;

  const now = Date.now();
  const minutes = istMinutes(settings);
  const { when, targetDay } = nextReminder(now, minutes);
  await chrome.alarms.create(ALARM_PREFIX + targetDay, { when });

  // After install/settings changes, don't fire an instant "late" reminder for today.
  if (suppressTodayIfPassed && reminderInstantForDay(utcDayStartMs(now), minutes) <= now) {
    await setReminderState({ lastReminderDay: utcDateString(now) });
  }
}

async function ensureScheduled() {
  const settings = await getSettings();
  if (!(await chrome.alarms.get(HEARTBEAT))) {
    await chrome.alarms.create(HEARTBEAT, { delayInMinutes: 1, periodInMinutes: 15 });
  }
  if (!settings.reminderEnabled) return;
  const alarms = await chrome.alarms.getAll();
  if (!alarms.some((a) => a.name.startsWith(ALARM_PREFIX))) await scheduleReminder();
}

async function notify(id, title, message) {
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message,
    priority: 2,
  });
}

/** Fire the reminder for a UTC day at most once, and only if that day is still current. */
async function handleReminder(targetDay) {
  if (reminderInFlight) return;
  reminderInFlight = true;
  try {
    if (utcDateString(Date.now()) !== targetDay) return; // stale: the day already reset
    const settings = await getSettings();
    if (!settings.reminderEnabled) return;
    const state = await getReminderState();
    if (state.lastReminderDay === targetDay) return;     // already handled: no duplicates
    await setReminderState({ lastReminderDay: targetDay });

    const result = await runCheck({ force: true });
    if (result.status === "NOT_COMPLETED" || result.status === "NO_ACTIVITY") {
      await notify("lsg-reminder", "LeetCode day looks incomplete",
        "No accepted submission found yet for today's LeetCode calendar day. It resets at 5:30 AM IST.");
    } else if (result.status === "UNABLE") {
      await notify("lsg-reminder", "Check your LeetCode day",
        "Couldn't verify today's activity just now. Open LeetCode or the extension to check before the 5:30 AM IST reset.");
    }
    // COMPLETED / ACTIVITY_DETECTED: nothing to remind about.
  } finally {
    reminderInFlight = false;
  }
}

/** If Chrome was closed or the alarm was late, still remind once while the day is current. */
async function catchUpIfMissed() {
  const settings = await getSettings();
  if (!settings.reminderEnabled) return;
  const now = Date.now();
  const instant = reminderInstantForDay(utcDayStartMs(now), istMinutes(settings));
  if (now >= instant) await handleReminder(utcDateString(now));
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(HEARTBEAT, { delayInMinutes: 1, periodInMinutes: 15 });
  await scheduleReminder({ suppressTodayIfPassed: true });
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureScheduled();
  await scheduleReminder();
  await catchUpIfMissed();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === HEARTBEAT) {
    await ensureScheduled();
    await catchUpIfMissed();
  } else if (alarm.name.startsWith(ALARM_PREFIX)) {
    await handleReminder(alarm.name.slice(ALARM_PREFIX.length));
    await scheduleReminder(); // queue the next day's reminder
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
  const before = changes.settings.oldValue || {};
  const after = changes.settings.newValue || {};
  if (before.reminderEnabled !== after.reminderEnabled || before.reminderTime !== after.reminderTime) {
    scheduleReminder({ suppressTodayIfPassed: true });
  }
});

chrome.notifications.onClicked.addListener(async (id) => {
  await chrome.tabs.create({ url: LEETCODE_URL });
  chrome.notifications.clear(id);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TEST_NOTIFICATION") {
    notify("lsg-test", "Test reminder", "Notifications work. Click this to open LeetCode.")
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true; // async response
  }
  return false;
});

ensureScheduled(); // runs every time the service worker wakes up
