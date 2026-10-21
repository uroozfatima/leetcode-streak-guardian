import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCountdown, nextReminder, nextResetMs, parseTimeOfDay, reminderInstantForDay,
  utcDateString, utcDayStartMs,
} from "../lib/time.js";

const t = (iso) => Date.parse(iso);

test("UTC day resets at exactly 05:30 IST (00:00 UTC)", () => {
  // 05:29:59 IST on 20 Oct == 23:59:59 UTC on 19 Oct -> still the 19th
  assert.equal(utcDateString(t("2026-10-19T23:59:59Z")), "2026-10-19");
  // 05:30:00 IST on 20 Oct == 00:00:00 UTC on 20 Oct -> the 20th
  assert.equal(utcDateString(t("2026-10-20T00:00:00Z")), "2026-10-20");
});

test("2 AM IST still belongs to the previous UTC day", () => {
  const twoAmIst = t("2026-10-20T02:00:00+05:30");
  assert.equal(utcDateString(twoAmIst), "2026-10-19");
});

test("next reset is next 00:00 UTC", () => {
  const now = t("2026-10-19T20:15:00Z");
  assert.equal(nextResetMs(now), t("2026-10-20T00:00:00Z"));
  assert.equal(formatCountdown(nextResetMs(now) - now), "03:45:00");
});

test("04:30 IST reminder is 23:00 UTC, one hour before reset", () => {
  const mins = parseTimeOfDay("04:30");
  const day = t("2026-10-19T00:00:00Z");
  assert.equal(reminderInstantForDay(day, mins), t("2026-10-19T23:00:00Z"));
});

test("nextReminder picks today's instant if still ahead, else tomorrow's", () => {
  const mins = parseTimeOfDay("04:30");
  const before = nextReminder(t("2026-10-19T10:00:00Z"), mins);
  assert.equal(before.when, t("2026-10-19T23:00:00Z"));
  assert.equal(before.targetDay, "2026-10-19");
  const after = nextReminder(t("2026-10-19T23:30:00Z"), mins);
  assert.equal(after.when, t("2026-10-20T23:00:00Z"));
  assert.equal(after.targetDay, "2026-10-20");
});

test("evening IST reminder (20:00 IST = 14:30 UTC) stays in the same UTC day", () => {
  const r = nextReminder(t("2026-10-19T01:00:00Z"), parseTimeOfDay("20:00"));
  assert.equal(r.when, t("2026-10-19T14:30:00Z"));
});

test("parseTimeOfDay validates input", () => {
  assert.equal(parseTimeOfDay("04:30"), 270);
  assert.equal(parseTimeOfDay("24:00"), null);
  assert.equal(parseTimeOfDay("abc"), null);
  assert.equal(utcDayStartMs(t("2026-10-19T13:00:00Z")), t("2026-10-19T00:00:00Z"));
});
