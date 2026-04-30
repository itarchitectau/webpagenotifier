# Page Element Notifier

A Chrome extension that monitors CSS-selected HTML elements on any web page and sends a push notification via [Pushover](https://pushover.net) or [Telegram](https://telegram.org) when they appear.

## Use cases

- Get notified when a sold-out product comes back in stock
- Alert when an error banner or status message appears on a dashboard
- Watch for a specific element on a page you cannot actively monitor

## How it works

1. You define one or more **rules**, each containing a CSS selector and an optional label.
2. The extension injects a content script into every page that uses a `MutationObserver` to watch for matching elements — both on initial load and as the DOM changes dynamically.
3. When a match is found, the background service worker sends a push notification to your device via the configured channel (Pushover or Telegram).
4. Notifications are rate-limited by a configurable **cooldown interval** (default 1 hour). If the element is still present after the cooldown expires, a new notification is sent automatically.
5. Optionally configure **Quiet Hours** to suppress all notifications during a set time window (e.g. overnight).
6. Optionally, enable **Auto-Refresh** from the popup to reload the tab on a timer — useful for pages that require a full reload to surface new content.

## Project structure

```
test-notifier/
├── manifest.json        # Chrome Manifest V3 declaration
├── background.js        # Service worker: receives match events, calls Pushover or Telegram API
├── content.js           # Injected into every page: DOM watching via MutationObserver
├── popup.html / .js     # Toolbar popup: shows channel status, active rules, and auto-refresh controls
├── options.html / .js   # Settings page: manage notification channel, credentials, quiet hours, rules, and export/import
├── styles.css           # Shared styles for popup and options pages
├── icons/               # Extension icons (16px, 48px, 128px PNG)
├── create-icons.html    # Browser-based icon generator (no dependencies)
└── generate-icons.js    # Node.js icon generator (requires canvas package)
```

## Prerequisites

- Google Chrome (or any Chromium-based browser supporting Manifest V3)
- A notification account for your chosen channel:
  - **Pushover** — [pushover.net](https://pushover.net) (free 30-day trial, then a one-time purchase per platform)
  - **Telegram** — free; requires a Telegram account

## Setup steps

### Step 1 — Set up your notification channel

Choose one of the two supported channels and gather its credentials before loading the extension.

#### Option A — Pushover

1. Register at [pushover.net](https://pushover.net) and log in.
2. Install the Pushover app on your phone or desktop to receive notifications.
3. Copy your **User Key** from the top of the Pushover dashboard.
4. Go to [pushover.net/apps/build](https://pushover.net/apps/build) and create a new application (any name, e.g. "Page Notifier").
5. Copy the **API Token** shown on the application page.

#### Option B — Telegram

1. Open Telegram and message **@BotFather**.
2. Send `/newbot` and follow the prompts to create a bot. Copy the **Bot Token** provided.
3. Send any message to your new bot.
4. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser (replace `<TOKEN>` with your bot token).
5. Find `"chat":{"id": 123456}` in the response — that number is your **Chat ID**.

### Step 2 — Generate extension icons

The `icons/` folder must contain three PNG files before Chrome will load the extension.

**Option A — browser (no dependencies):**

1. Open `create-icons.html` in Chrome.
2. Click **Generate & Download Icons**.
3. Move the three downloaded files (`icon16.png`, `icon48.png`, `icon128.png`) into the `icons/` folder.

**Option B — Node.js:**

```bash
npm install canvas
node generate-icons.js
```

### Step 3 — Load the extension in Chrome

1. Navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `test-notifier` project folder.

The extension icon will appear in the Chrome toolbar.

### Step 4 — Configure notification credentials

1. Click the extension icon in the toolbar.
2. Click **Open Settings**.
3. Under **Notification Channel**, select **Pushover** or **Telegram** from the dropdown.
4. Enter the credentials for your chosen channel:
   - **Pushover**: User Key and App Token from Step 1A.
   - **Telegram**: Bot Token and Chat ID from Step 1B.
5. Optionally change the **Notification Cooldown** (seconds). This controls how long the extension waits before re-sending a notification for the same rule on the same tab. Defaults to `3600` (1 hour).
6. Click **Save Credentials**.

### Step 5 — Add monitoring rules

In the Settings page, scroll to **Monitoring Rules** and fill in the form:

| Field | Description |
|---|---|
| Label | A friendly name shown in the notification title |
| CSS Selector | Any valid CSS selector (e.g. `.alert`, `#error-banner`, `[data-status="error"]`) |
| Notification Priority | Normal, High, or Emergency (see below) |
| Enabled | Toggle the rule on or off without deleting it |

Click **Save Rule**. The rule takes effect immediately on any new page load.

### Step 6 — Verify it works

1. Open a page where your selector is present (or use DevTools to temporarily add an element matching it).
2. Within a few seconds you should receive a notification on your chosen channel.
3. If nothing arrives, check the service worker logs at `chrome://extensions` → **Inspect views: service worker**.

## Notification channels

Only one channel is active at a time, selected in the **Notification Channel** dropdown in Settings. Switching channels takes effect immediately for all subsequent notifications — no restart needed.

| Channel | Cost | Delivery |
|---|---|---|
| Pushover | One-time purchase per platform | Push notification via Pushover app |
| Telegram | Free | Message from your bot in Telegram |

## Notification priority

Priority settings apply to Pushover only. When Telegram is the active channel, the priority field is saved with the rule but has no effect on delivery.

Each rule can be assigned one of three Pushover priority levels:

| Priority | Pushover value | Behaviour |
|---|---|---|
| Normal | `0` | Standard sound and alert (default) |
| High | `1` | Bypasses the recipient's quiet hours |
| Emergency | `2` | Repeats at a set interval until the user acknowledges it in the Pushover app |

### Emergency priority extra settings

When **Emergency** is selected, two additional fields appear on the rule form:

| Field | Description | Constraints |
|---|---|---|
| Retry every | How often (seconds) Pushover re-sends the alert | Minimum 30 s |
| Stop retrying after | How long (seconds) before Pushover gives up | 30 – 10800 s |

## Notification cooldown

The cooldown setting controls how often repeat notifications can be sent for the same rule while the matched element remains on the page.

| Cooldown | Behaviour |
|---|---|
| `0` / not set | Defaults to 3600 seconds |
| `60` | Re-notifies every minute while the element is still present |
| `3600` (default) | Re-notifies at most once per hour |
| `86400` | Re-notifies at most once per day |

The cooldown timer resets automatically when you navigate to a new URL or close the tab.

## Notification format

Both channels receive the same information:

| Field | Content |
|---|---|
| Title | The rule label, or the CSS selector if no label is set |
| Body | Page title, matched element text (up to 200 characters), and page URL |
| Link | Direct link back to the page |

Telegram messages are formatted with HTML (bold title, plain body lines, clickable link). Pushover messages include a native URL attachment that opens in the browser.

## Quiet Hours

Quiet hours suppress all notifications during a configured daily time window, regardless of which channel or rule would have fired. This is useful for avoiding overnight or out-of-hours interruptions.

### Configuring quiet hours

1. Click the extension icon and then **Open Settings**.
2. In the **Quiet Hours** card, check **Enable quiet hours**.
3. Set the **Start time** and **End time** using the time pickers.
4. Click **Save Quiet Hours**.

### Behaviour

| Detail | Notes |
|---|---|
| Scope | Global — applies to all rules and both notification channels |
| Timezone | Uses the local time of the machine running Chrome |
| Spanning midnight | Set end time before start time (e.g. Start 22:00, End 07:00) to suppress overnight |
| Same-day window | Set end time after start time (e.g. Start 09:00, End 17:00) to suppress during the day |
| Popup indicator | While quiet hours are active, the popup shows a red warning so you can tell at a glance why notifications are paused |

Quiet hours check happens after the cooldown check. A notification suppressed by quiet hours does **not** reset the cooldown timer — once quiet hours end, the next match will fire normally (subject to the cooldown).

## Auto-Refresh

Some pages don't update their DOM dynamically — they require a full reload to surface new content (e.g. stock pages, booking systems). The Auto-Refresh feature reloads a specific tab on a configurable timer so the content script can check for matching elements after each reload.

### Enabling auto-refresh

1. Navigate to the tab you want to keep fresh.
2. Click the extension icon to open the popup.
3. In the **Auto-Refresh This Tab** section, set the interval in seconds (minimum 30).
4. Click **Enable**.

The popup shows the current status (`Active — every Xs` in green, or `Disabled`). While active, the **Enable** button becomes **Update**, so you can change the interval without disabling first.

### Behaviour

| Detail | Notes |
|---|---|
| Scope | Per-tab — each tab has its own independent refresh timer |
| Persistence | Survives the popup closing and service worker sleep/wake cycles; cleared on browser restart |
| Tab closure | The timer is automatically cancelled when the tab is closed |
| Minimum interval | 30 seconds (Chrome may enforce ~60 s in practice) |

Auto-refresh and the notification cooldown work independently. A typical setup: set auto-refresh to 60 s and the notification cooldown to 3600 s — the page reloads every minute, but you receive at most one notification per hour per rule.

## Managing rules

In the Settings page you can:

- **Edit** an existing rule to change its selector or label
- **Disable / Enable** a rule to pause it temporarily
- **Delete** a rule to remove it permanently

## Export / Import

The **Export / Import** card at the bottom of the Settings page lets you back up your configuration or transfer it to another machine.

### Exporting

Click **Export Configuration** to download a `page-notifier-config.json` file containing all current settings:

- Notification channel selection
- Pushover and Telegram credentials
- Notification cooldown
- Quiet hours settings
- All monitoring rules

The file uses a simple JSON envelope:

```json
{
  "version": 1,
  "exported": "2026-05-01T10:00:00.000Z",
  "config": { ... }
}
```

### Importing

1. Click **Open Settings** on the target machine.
2. Scroll to **Export / Import** and select your `.json` file.
3. Click **Import Configuration**.
4. Confirm the prompt — all current settings will be replaced.

The settings page reloads automatically once the import completes.

### What is not exported

| Excluded | Reason |
|---|---|
| Notification deduplication timestamps | Machine/session specific; would block notifications on the new machine |
| Auto-refresh state | Tab-level, session-scoped — does not make sense to transfer |

## Development notes

- No build step or bundler is required — all files are plain vanilla JavaScript loaded directly by Chrome.
- Rule, credential, cooldown, active channel, and quiet hours data are stored in `chrome.storage.sync`, so they sync across devices signed into the same Chrome profile.
- Auto-refresh state is stored in `chrome.storage.session` (ephemeral, per-session) and auto-refresh alarms are named `refresh-{tabId}`. Both are cleaned up automatically when the tab closes or the browser restarts.
- The deduplication key is `tabId:ruleId`, stored with a timestamp. A notification is suppressed only while `Date.now() - lastSent < cooldownMs`; once the window passes the notification fires again automatically. The cooldown is shared across channels — switching channel mid-session does not reset it.
- The content script sets a `setInterval` at the configured cooldown interval so elements that are already present in the DOM (and don't trigger a `MutationObserver` event) are still re-checked and re-notified.
- All API calls (Pushover and Telegram) are made from the background service worker to avoid CORS issues.

## Troubleshooting

| Problem | Solution |
|---|---|
| No notification received | Open Settings and confirm the correct channel is selected and its credentials are saved. Check the service worker console at `chrome://extensions` → *Inspect views: service worker*. Also check whether the popup shows a quiet hours warning. |
| Notifications paused unexpectedly | Open the popup — if a red quiet hours banner is shown, notifications are being suppressed for the current time window. Adjust or disable quiet hours in Settings. |
| Telegram bot not responding | Make sure you have sent at least one message to your bot before calling `getUpdates`. Bots cannot initiate conversations — the chat ID is only available after you message them first. |
| "Invalid CSS selector" error | Test your selector in the browser DevTools console: `document.querySelector('your-selector')`. |
| Notification fires only once then stops | Check the cooldown setting in Settings — the default is 1 hour. Lower it to get more frequent notifications. |
| Page is not refreshing automatically | Open the popup and confirm the Auto-Refresh status shows green. If the tab was closed and reopened, auto-refresh must be re-enabled — it does not persist across browser restarts. |
| Auto-refresh interval shorter than expected | Chrome enforces a minimum alarm period of approximately 30–60 seconds for extensions. |
| Import has no effect | Ensure the file was exported by this extension. The importer silently skips unrecognised keys — if no known keys are found it will show an error. |
| Extension not loading | Ensure the `icons/` folder contains all three PNG files, then reload the extension at `chrome://extensions`. |

## Privacy

All data (credentials, channel selection, and rules) is stored locally in your Chrome profile via `chrome.storage.sync`. The only external network calls made are to `api.pushover.net` (Pushover channel) or `api.telegram.org` (Telegram channel) when a monitored element is detected. No data is sent to any other third party.
