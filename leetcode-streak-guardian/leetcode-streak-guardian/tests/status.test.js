import test from "node:test";
import assert from "node:assert/strict";
import { countAcceptedForDay, countSubmissionsForDay, deriveStatus } from "../lib/status.js";

const now = Date.parse("2026-10-19T20:00:00Z");
const dayStartSec = Date.parse("2026-10-19T00:00:00Z") / 1000;
const ok = (data) => ({ ok: true, data });
const fail = (code = "NETWORK", message = "Could not reach LeetCode.") => ({ ok: false, error: { code, message } });

test("calendar counts only the UTC day's key", () => {
  const cal = { [dayStartSec - 86400]: 5, [dayStartSec]: 3 };
  assert.equal(countSubmissionsForDay(cal, dayStartSec * 1000), 3);
  assert.equal(countSubmissionsForDay({}, dayStartSec * 1000), 0);
});

test("accepted counter ignores yesterday and tomorrow", () => {
  const list = [
    { timestamp: String(dayStartSec + 100) },
    { timestamp: String(dayStartSec - 1) },
    { timestamp: String(dayStartSec + 86400) },
  ];
  assert.equal(countAcceptedForDay(list, dayStartSec * 1000), 1);
});

test("COMPLETED when an accepted submission is dated today", () => {
  const r = deriveStatus({ calendar: ok({}), accepted: ok([{ timestamp: String(dayStartSec + 50) }]), nowMs: now });
  assert.equal(r.status, "COMPLETED");
});

test("NOT_COMPLETED when both succeed and nothing accepted today", () => {
  const r = deriveStatus({ calendar: ok({ [dayStartSec]: 2 }), accepted: ok([{ timestamp: String(dayStartSec - 500) }]), nowMs: now });
  assert.equal(r.status, "NOT_COMPLETED");
  assert.match(r.explanation, /2 submissions/);
});

test("ACTIVITY_DETECTED when only the calendar works and it shows activity", () => {
  const r = deriveStatus({ calendar: ok({ [dayStartSec]: 1 }), accepted: fail("API_CHANGED", "x"), nowMs: now });
  assert.equal(r.status, "ACTIVITY_DETECTED");
  assert.match(r.explanation, /not verified/);
});

test("NO_ACTIVITY only when the calendar succeeded and is empty today", () => {
  const r = deriveStatus({ calendar: ok({}), accepted: fail(), nowMs: now });
  assert.equal(r.status, "NO_ACTIVITY");
});

test("failed requests NEVER produce an empty-day verdict", () => {
  const r = deriveStatus({ calendar: fail(), accepted: fail("RATE_LIMIT", "slow down"), nowMs: now });
  assert.equal(r.status, "UNABLE");
  assert.match(r.explanation, /does not mean your day is empty/);
});

test("accepted list failing alone cannot declare NOT_COMPLETED", () => {
  const r = deriveStatus({ calendar: fail(), accepted: ok([]), nowMs: now });
  assert.equal(r.status, "NOT_COMPLETED"); // accepted list succeeded and is empty: genuinely nothing accepted
  const r2 = deriveStatus({ calendar: ok({}), accepted: fail(), nowMs: now });
  assert.notEqual(r2.status, "NOT_COMPLETED");
});

test("invalid username is reported as UNABLE with guidance", () => {
  const r = deriveStatus({ calendar: fail("INVALID_USERNAME", "No such user."), accepted: fail("INVALID_USERNAME", "No such user."), nowMs: now });
  assert.equal(r.status, "UNABLE");
  assert.match(r.explanation, /Settings/);
});
