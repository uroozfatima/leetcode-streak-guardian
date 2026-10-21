// LeetCode public GraphQL client. Sends NO cookies or credentials.
export const ENDPOINT = "https://leetcode.com/graphql";
export const TIMEOUT_MS = 12_000;
export const AC_LIMIT = 20;

const CALENDAR_QUERY = `
query userProfileCalendar($username: String!, $year: Int) {
  matchedUser(username: $username) {
    userCalendar(year: $year) {
      activeYears
      streak
      totalActiveDays
      submissionCalendar
    }
  }
}`;

const RECENT_AC_QUERY = `
query recentAcSubmissions($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    id
    title
    titleSlug
    timestamp
  }
}`;

class LeetCodeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function graphql(query, variables, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new LeetCodeError("TIMEOUT", "LeetCode took too long to respond.");
    }
    throw new LeetCodeError("NETWORK", "Could not reach LeetCode. Check your internet connection.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new LeetCodeError("RATE_LIMIT", "LeetCode is rate-limiting requests. Wait a few minutes and try again.");
  }

  let body;
  try {
    body = await response.json();
  } catch {
    if (response.status === 403) {
      throw new LeetCodeError("BLOCKED", "LeetCode blocked the request (HTTP 403, possibly a Cloudflare check). Try again later.");
    }
    throw new LeetCodeError("API_CHANGED", `LeetCode returned an unreadable response (HTTP ${response.status}).`);
  }

  if (Array.isArray(body?.errors) && body.errors.length) {
    const msg = body.errors.map((e) => e?.message).filter(Boolean).join("; ");
    if (/does not exist|not found|no such user/i.test(msg)) {
      throw new LeetCodeError("INVALID_USERNAME", "LeetCode says that username does not exist.");
    }
    throw new LeetCodeError("API_CHANGED", `LeetCode rejected the query: ${msg || "unknown error"}.`);
  }
  if (!response.ok) {
    throw new LeetCodeError("HTTP", `LeetCode returned HTTP ${response.status}.`);
  }
  if (!body || typeof body.data !== "object" || body.data === null) {
    throw new LeetCodeError("API_CHANGED", "LeetCode's response had no data field. The API may have changed.");
  }
  return body.data;
}

async function settle(fn) {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof LeetCodeError) return { ok: false, error: { code: err.code, message: err.message } };
    return { ok: false, error: { code: "UNKNOWN", message: String(err?.message || err) } };
  }
}

/** Public submission calendar: { "<utc-midnight epoch seconds>": count, ... } for the UTC year. */
export function fetchCalendar(username, nowMs = Date.now(), fetchImpl = fetch) {
  return settle(async () => {
    const year = new Date(nowMs).getUTCFullYear();
    const data = await graphql(CALENDAR_QUERY, { username, year }, fetchImpl);
    if (data.matchedUser === null) {
      throw new LeetCodeError("INVALID_USERNAME", "LeetCode says that username does not exist.");
    }
    const raw = data.matchedUser?.userCalendar?.submissionCalendar;
    if (typeof raw !== "string") {
      throw new LeetCodeError("API_CHANGED", "The calendar data was missing from LeetCode's response.");
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new LeetCodeError("API_CHANGED", "The calendar data was not valid JSON.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LeetCodeError("API_CHANGED", "The calendar data had an unexpected shape.");
    }
    return parsed;
  });
}

/** Most recent accepted submissions, each with an epoch-second timestamp string. */
export function fetchRecentAccepted(username, fetchImpl = fetch) {
  return settle(async () => {
    const data = await graphql(RECENT_AC_QUERY, { username, limit: AC_LIMIT }, fetchImpl);
    if (!Array.isArray(data.recentAcSubmissionList)) {
      throw new LeetCodeError("API_CHANGED", "The accepted-submissions list was missing from LeetCode's response.");
    }
    return data.recentAcSubmissionList;
  });
}
