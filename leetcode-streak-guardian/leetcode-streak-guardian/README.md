# LeetCode Streak Guardian

A Chrome (Manifest V3) extension that tells you whether **today's LeetCode calendar day** has activity, and reminds you before it resets.

LeetCode's day follows **UTC**, so for India it resets at **5:30 AM IST**. If you study until 2-4 AM, you are still in the *previous* LeetCode day. This extension shows both clocks side by side so you never have to guess.

No frameworks, no build step, no server, no developer account. Plain HTML, CSS and JavaScript.

---

## 1. What the status means (read this once)

LeetCode exposes two relevant public GraphQL queries at `https://leetcode.com/graphql`. The extension uses both:

| Query | What it returns | Limitation |
|---|---|---|
| `matchedUser.userCalendar.submissionCalendar` | A JSON **string** mapping UTC-midnight timestamps to a daily count | Counts *submissions/activity*. It does **not** say whether any was Accepted. |
| `recentAcSubmissionList` | Your latest Accepted submissions with epoch-second timestamps | Only recent ones (limit 20), and can lag by a minute or two. |

| Status | Meaning |
|---|---|
| **COMPLETED** (green) | An *accepted* submission dated today (UTC) was found. |
| **NOT COMPLETED** (red) | Accepted list loaded and has nothing dated today. |
| **ACTIVITY DETECTED** (green) | Only the calendar worked: it shows submissions today, but acceptance is **not** verified. |
| **NO ACTIVITY DETECTED** (red) | Only the calendar worked and it shows zero submissions today. |
| **UNABLE TO VERIFY** (yellow) | Network error, rate limit, bad username, or changed API. **Never means "empty".** |

A failed request can never produce a red status. This is covered by unit tests.

> **Honest caveat:** I could not call leetcode.com from my build sandbox, so the two queries above are written from LeetCode's publicly known schema and **not tested live**. Section 8 shows how to verify in 2 minutes. Unofficial endpoints can change without notice; if they do, you'll see UNABLE TO VERIFY with an "API may have changed" message instead of a wrong answer.

---

## 2. Project structure

```
leetcode-streak-guardian/
  manifest.json        Extension config: permissions, popup, service worker
  popup.html           Popup layout (what you see when you click the icon)
  popup.css            Popup styling (dark navy, purple/blue, green/red/yellow)
  popup.js             Popup behavior: clock, countdown, buttons, settings
  background.js        Service worker: schedules reminders, shows notifications
  lib/
    time.js            UTC/IST math, reset countdown, reminder scheduling
    leetcode.js        GraphQL requests + error classification (no cookies sent)
    status.js          Turns API results into COMPLETED / NOT COMPLETED / etc.
    storage.js         chrome.storage helpers (settings, cache, history)
    checker.js         One full status check; shared by popup and background
  icons/               icon16.png, icon48.png, icon128.png
  tests/               Optional unit tests (Node, no dependencies)
  package.json         Only for `npm test`; Chrome ignores it
```

Permissions: `alarms` (reminders), `notifications`, `storage`, and host access to `https://leetcode.com/*`. The `tabs` permission is **not** needed because opening a tab doesn't require it.

---

## 3. Install the tools (Windows)

1. **VS Code:** download from https://code.visualstudio.com, run the installer, keep "Add to PATH" ticked.
2. **Google Chrome:** https://www.google.com/chrome if you don't have it.
3. *(Optional)* **Node.js LTS** from https://nodejs.org, only needed to run the tests.

No VS Code extensions are required. Optional: *Prettier* for formatting.

## 4. Open the project

1. Extract the ZIP (right-click > **Extract All**), e.g. to `C:\Users\<you>\leetcode-streak-guardian`.
2. Open VS Code > **File > Open Folder** > pick the extracted `leetcode-streak-guardian` folder (the one containing `manifest.json`).

## 5. Load it in Chrome (no build needed)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. Click the puzzle-piece icon in the toolbar and **pin** LeetCode Streak Guardian.
5. Click it, type your public LeetCode username, and press **Save**.

After editing any file: go to `chrome://extensions` and click the circular **reload** icon on the extension card. Popup changes appear next time you open it; `background.js` changes need the reload. Click **service worker** on the card to see background logs and errors.

## 6. Reminders

- Default **4:30 AM IST** (= 23:00 UTC, one hour before reset). Change it in Settings. Any time works; the extension converts IST to UTC itself.
- It checks LeetCode *at reminder time* and only notifies when the day looks incomplete. If the check fails, the notification says it **couldn't verify**; it never claims the day is empty.
- One reminder per UTC day, enforced in storage. Stale alarms from a previous day are ignored.
- Rescheduled on install, browser startup, extension update/reload, and when you change reminder settings. A 15-minute heartbeat alarm repairs the schedule and catches a missed reminder (while the day is still current).
- **Limits:** Chrome alarms can fire late, and nothing fires while Chrome is fully closed. If Chrome starts after the reminder time but before the reset, you still get one catch-up notification. Always open the popup to verify manually.
- Windows may hide notifications under **Focus assist / Do not disturb**. Use **Test notification** to check.

## 7. Privacy

Only public data is read. No password, cookie or token is requested or stored; requests use `credentials: "omit"`. Stored locally: your username, reminder settings, the latest result and a 14-day status log. Only leetcode.com is contacted.

## 8. Test it (manual live check)

1. Open https://leetcode.com/graphql in a normal tab's DevTools console and run:
   ```js
   fetch("https://leetcode.com/graphql",{method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({query:`query($u:String!){recentAcSubmissionList(username:$u,limit:5){title timestamp}}`,variables:{u:"YOUR_USERNAME"}})
   }).then(r=>r.json()).then(console.log)
   ```
   You should see recent accepted problems with epoch-second timestamps.
2. Open the popup. A recent accepted solve dated today (UTC) should show **COMPLETED**.
3. Enter a nonsense username: expect **UNABLE TO VERIFY** with "that username does not exist".
4. Turn off Wi-Fi and press **Check now**: expect **UNABLE TO VERIFY**, never red.
5. Press **Test notification**, then click it: LeetCode should open.
6. To test the real reminder, set reminder time 2-3 minutes ahead (in IST) and save. If you have no accepted solve today you'll get the notification.

If it shows UNABLE TO VERIFY with "blocked (HTTP 403)" or "API may have changed", open the service-worker console from `chrome://extensions` and tell me the exact message so we can adapt the query.

## 9. Automated tests (optional)

```
cd leetcode-streak-guardian
npm test
```
28 tests cover the 5:30 AM IST boundary, reminder math, status rules, GraphQL error handling, and cache invalidation.
