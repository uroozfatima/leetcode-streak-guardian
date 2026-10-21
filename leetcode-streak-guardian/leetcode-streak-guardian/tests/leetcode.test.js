import test from "node:test";
import assert from "node:assert/strict";
import { fetchCalendar, fetchRecentAccepted } from "../lib/leetcode.js";
import { fakeFetch } from "./helpers.js";

const now = Date.parse("2026-10-19T20:00:00Z");

test("parses the submissionCalendar JSON string", async () => {
  const f = fakeFetch({ userProfileCalendar: { body: { data: { matchedUser: { userCalendar: { submissionCalendar: '{"1792368000": 4}' } } } } } });
  const r = await fetchCalendar("alice", now, f);
  assert.deepEqual(r, { ok: true, data: { 1792368000: 4 } });
});

test("unknown user via GraphQL error -> INVALID_USERNAME", async () => {
  const f = fakeFetch({ userProfileCalendar: { body: { errors: [{ message: "That user does not exist." }], data: { matchedUser: null } } } });
  const r = await fetchCalendar("nobody", now, f);
  assert.equal(r.error.code, "INVALID_USERNAME");
});

test("matchedUser null without errors -> INVALID_USERNAME", async () => {
  const f = fakeFetch({ userProfileCalendar: { body: { data: { matchedUser: null } } } });
  assert.equal((await fetchCalendar("nobody", now, f)).error.code, "INVALID_USERNAME");
});

test("429 -> RATE_LIMIT", async () => {
  const f = fakeFetch({ userProfileCalendar: { status: 429, body: {} } });
  assert.equal((await fetchCalendar("a", now, f)).error.code, "RATE_LIMIT");
});

test("network failure -> NETWORK", async () => {
  const f = fakeFetch({ userProfileCalendar: new TypeError("Failed to fetch") });
  assert.equal((await fetchCalendar("a", now, f)).error.code, "NETWORK");
});

test("missing calendar field -> API_CHANGED", async () => {
  const f = fakeFetch({ userProfileCalendar: { body: { data: { matchedUser: { userCalendar: {} } } } } });
  assert.equal((await fetchCalendar("a", now, f)).error.code, "API_CHANGED");
});

test("recent accepted list is returned as an array", async () => {
  const f = fakeFetch({ recentAcSubmissions: { body: { data: { recentAcSubmissionList: [{ title: "Two Sum", timestamp: "1792400000" }] } } } });
  const r = await fetchRecentAccepted("a", f);
  assert.equal(r.ok, true);
  assert.equal(r.data.length, 1);
});

test("null accepted list -> API_CHANGED, never an empty list", async () => {
  const f = fakeFetch({ recentAcSubmissions: { body: { data: { recentAcSubmissionList: null } } } });
  assert.equal((await fetchRecentAccepted("a", f)).error.code, "API_CHANGED");
});
