import { getTodaysCache, runCheck } from "./lib/checker.js";
import { getHistory, getSettings, isValidUsername, saveSettings } from "./lib/storage.js";
import {
  DAY_MS, formatCountdown, formatIst, formatIstStamp, nextResetMs, parseTimeOfDay,
  utcDateString, utcDayStartMs,
} from "./lib/time.js";

const $ = (id) => document.getElementById(id);
const LEETCODE_URL = "https://leetcode.com/problemset/";
let renderedDay = utcDateString(Date.now());
let checking = false;
let hasStatus = false;

function setMsg(el, text, kind = "") {
  el.textContent = text;
  el.className = `msg ${kind}`.trim();
}

/* ---------- live clock ---------- */
function tick() {
  const now = Date.now();
  const ist = formatIst(now);
  $("utc-date").textContent = utcDateString(now);
  $("ist-time").textContent = ist.time;
  $("ist-date").textContent = ist.date;
  $("countdown").textContent = formatCountdown(nextResetMs(now) - now);
  $("progress").style.width = `${(((now - utcDayStartMs(now)) / DAY_MS) * 100).toFixed(2)}%`;
  // Day rolled over while the popup was open: drop stale status and re-check.
  if (utcDateString(now) !== renderedDay) {
    renderedDay = utcDateString(now);
    refresh({ force: true });
  }
}

/* ---------- rendering ---------- */
function renderStatus(result, { stale = false } = {}) {
  hasStatus = true;
  $("status-card").className = `card status tone-${result.tone || "idle"}`;
  $("status-label").textContent = result.label;
  $("status-text").textContent = result.explanation;

  const badge = $("check-badge");
  if (stale) {
    badge.textContent = "Updating…";
    badge.className = "badge";
  } else if (result.succeeded) {
    badge.textContent = "Check succeeded";
    badge.className = "badge good";
  } else {
    badge.textContent = "Check failed";
    badge.className = "badge fail";
  }
  $("last-checked").textContent = `Last checked: ${formatIstStamp(result.checkedAt)}`;

  const note = $("last-success");
  if (!result.succeeded && result.lastSuccess) {
    note.textContent = `Last successful check today: ${result.lastSuccess.label} at ${formatIstStamp(result.lastSuccess.checkedAt)}.`;
    note.hidden = false;
  } else {
    note.hidden = true;
  }
}

function renderChecking() {
  $("status-card").className = "card status tone-idle";
  $("status-label").textContent = "CHECKING…";
  $("status-text").textContent = "Contacting LeetCode.";
  $("check-badge").textContent = "Pending";
  $("check-badge").className = "badge";
}

async function renderHistory() {
  const list = $("history");
  list.replaceChildren();
  const history = await getHistory();
  if (!history.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No checks yet. Press Check now to start your log.";
    list.append(li);
    return;
  }
  for (const entry of history.slice(0, 7)) {
    const li = document.createElement("li");
    const day = document.createElement("span");
    day.className = "day";
    day.textContent = entry.day;
    const chip = document.createElement("span");
    chip.className = `chip ${entry.tone || "warn"}`;
    chip.textContent = entry.label;
    li.append(day, chip);
    list.append(li);
  }
}

function renderProfileLink(username) {
  const a = $("profile-link");
  if (username) {
    a.href = `https://leetcode.com/u/${encodeURIComponent(username)}/`;
    a.hidden = false;
  } else {
    a.hidden = true;
  }
}

/* ---------- actions ---------- */
async function refresh({ force }) {
  if (checking) return;
  checking = true;
  const btn = $("btn-refresh");
  btn.disabled = true;
  btn.textContent = "Checking…";
  try {
    const settings = await getSettings();
    if (!settings.username.trim()) {
      $("onboarding").hidden = false;
      renderStatus(await runCheck(), {});
      return;
    }
    $("onboarding").hidden = true;
    if (hasStatus) {
      $("check-badge").textContent = "Updating…";
      $("check-badge").className = "badge";
    } else {
      renderChecking();
    }
    renderStatus(await runCheck({ force }));
  } catch (err) {
    renderStatus({
      label: "UNABLE TO VERIFY", tone: "warn", succeeded: false, checkedAt: Date.now(), lastSuccess: null,
      explanation: `Something unexpected went wrong: ${err?.message || err}. This does not mean your day is empty.`,
    });
  } finally {
    btn.disabled = false;
    btn.textContent = "Check now";
    checking = false;
    renderHistory();
  }
}

async function saveUsername(raw, msgEl) {
  const username = raw.trim();
  if (!isValidUsername(username)) {
    setMsg(msgEl, "Use letters, numbers, hyphens or underscores (max 40).", "error");
    return false;
  }
  await saveSettings({ username });
  renderProfileLink(username);
  $("username").value = username;
  setMsg(msgEl, "Username saved.", "success");
  return true;
}

function toggleSettings(open) {
  const panel = $("settings");
  const show = open ?? panel.hidden;
  panel.hidden = !show;
  $("btn-settings").setAttribute("aria-expanded", String(show));
  if (show) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---------- wiring ---------- */
$("btn-refresh").addEventListener("click", () => refresh({ force: true }));
$("btn-open").addEventListener("click", () => chrome.tabs.create({ url: LEETCODE_URL }));
$("btn-settings").addEventListener("click", () => toggleSettings());

$("onboarding-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (await saveUsername($("onboard-username").value, $("onboard-msg"))) refresh({ force: true });
});

$("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("settings-msg");
  const time = $("reminder-time").value;
  if (parseTimeOfDay(time) === null) {
    setMsg(msg, "Pick a valid reminder time.", "error");
    return;
  }
  if (!(await saveUsername($("username").value, msg))) return;
  await saveSettings({ reminderEnabled: $("reminder-enabled").checked, reminderTime: time });
  setMsg(msg, "Saved. Reminder schedule updated.", "success");
  refresh({ force: true });
});

$("btn-test").addEventListener("click", async () => {
  const msg = $("settings-msg");
  try {
    const res = await chrome.runtime.sendMessage({ type: "TEST_NOTIFICATION" });
    if (res?.ok) setMsg(msg, "Test notification sent. If you don't see it, check Windows notification and Focus settings.", "success");
    else setMsg(msg, `Could not show the notification: ${res?.error || "unknown error"}`, "error");
  } catch (err) {
    setMsg(msg, `Could not reach the background worker: ${err.message}`, "error");
  }
});

/* ---------- init ---------- */
(async function init() {
  tick();
  setInterval(tick, 1000);

  const settings = await getSettings();
  $("username").value = settings.username;
  $("reminder-enabled").checked = settings.reminderEnabled;
  $("reminder-time").value = settings.reminderTime;
  renderProfileLink(settings.username.trim());
  renderHistory();

  if (!settings.username.trim()) {
    $("onboarding").hidden = false;
    renderStatus(await runCheck());
    return;
  }

  // Show today's cached result immediately (never yesterday's), then refresh.
  const cached = await getTodaysCache();
  if (cached) renderStatus(cached, { stale: true });
  refresh({ force: false });
})();
