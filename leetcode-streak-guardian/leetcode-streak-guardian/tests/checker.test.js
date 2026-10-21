import test from "node:test";
import assert from "node:assert/strict";
import { fakeFetch, installFakeChrome } from "./helpers.js";

const store = installFakeChrome();
const { runCheck, getTodaysCache } = await import("../lib/checker.js");

const now = Date.parse("2026-10-19T20:00:00Z");
const dayStartSec = Date.parse("2026-10-19T00:00:00Z") / 1000;
const good = fakeFetch({
  userProfileCalendar: { body: { data: { matchedUser: { userCalendar: { submissionCalendar: JSON.stringify({ [dayStartSec]: 2 }) } } } } },
  recentAcSubmissions: { body: { data: { recentAcSubmissionList: [{ timestamp: String(dayStartSec + 3600) }] } } },
});
const down = fakeFetch({
  userProfileCalendar: new TypeError("offline"),
  recentAcSubmissions: new TypeError("offline"),
});

test("no username -> UNABLE (no network call)", async () => {
  assert.equal((await runCheck({ nowMs: now, fetchImpl: down })).status, "UNABLE");
});

test("full check stores cache + history, then failure keeps last success but reports UNABLE", async () => {
  store.settings = { username: "alice", reminderEnabled: true, reminderTime: "04:30" };
  const a = await runCheck({ force: true, nowMs: now, fetchImpl: good });
  assert.equal(a.status, "COMPLETED");
  assert.equal(store.history[0].day, "2026-10-19");

  const b = await runCheck({ force: true, nowMs: now + 60_000, fetchImpl: down });
  assert.equal(b.status, "UNABLE");
  assert.equal(b.succeeded, false);
  assert.equal(b.lastSuccess.status, "COMPLETED");
  assert.equal(store.history[0].status, "COMPLETED", "a failed check must not overwrite a good history entry");
});

test("cache is invalidated when the UTC day changes", async () => {
  assert.ok(await getTodaysCache(now));
  assert.equal(await getTodaysCache(Date.parse("2026-10-20T00:00:01Z")), null);
});

test("non-forced checks within 15s reuse the cache", async () => {
  await runCheck({ force: true, nowMs: now + 120_000, fetchImpl: good });
  const r = await runCheck({ nowMs: now + 125_000, fetchImpl: down });
  assert.equal(r.status, "COMPLETED");
});
