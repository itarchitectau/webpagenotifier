# Page Element Notifier

A Chrome extension that monitors CSS-selected HTML elements on any web page and sends a push notification via [Pushover](https://pushover.net) when they appear.

## Use cases

- Get notified when a sold-out product comes back in stock
- Alert when an error banner or status message appears on a dashboard
- Watch for a specific element on a page you cannot actively monitor

## How it works

1. You define one or more **rules**, each containing a CSS selector and an optional label.
2. The extension injects a content script into every page that uses a `MutationObserver` to watch for matching elements — both on initial load and as the DOM changes dynamically.
3. When a match is found, the background service worker sends a push notification to your device via the Pushover API.
4. Notifications are rate-limited by a configurable **cooldown interval** (default 1 hour). If the element is still present after the cooldown expires, a new notification is sent automatically.
5. Optionally, enable **Auto-Refresh** from the popup to reload the tab on a timer — useful for pages that require a full reload to surface new content.

## Project structure

```
test-notifier/
├── manifest.json        # Chrome Manifest V3 declaration
├── background.js        # Service worker: receives match events, calls Pushover API
├── content.js           # Injected into every page: DOM watching via MutationObserver
├── popup.html / .js     # Toolbar popup: shows Pushover status, active rules, and auto-refresh controls
├── options.html / .js   # Settings page: manage Pushover credentials and rules
├── styles.css           # Shared styles for popup and options pages
├── icons/               # Extension icons (16px, 48px, 128px PNG)
├── create-icons.html    # Browser-based icon generator (no dependencies)
└── generate-icons.js    # Node.js icon generator (requires canvas package)
```

## Prerequisites

- Google Chrome (or any Chromium-based browser supporting Manifest V3)
- A [Pushover](https://pushover.net) account (free 30-day trial, then a one-time purchase per platform)

## Setup steps

### Step 1 — Create a Pushover account and application

1. Register at [pushover.net](https://pushover.net) and log in.
2. Install the Pushover app on your phone or desktop to receive notifications.
3. Copy your **User Key** from the top of the Pushover dashboard.
4. Go to [pushover.net/apps/build](https://pushover.net/apps/build) and create a new application (any name, e.g. "Page Notifier").
5. Copy the **API Token** shown on the application page.

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

### Step 4 — Configure Pushover credentials

1. Click the extension icon in the toolbar.
2. Click **Open Settings**.
3. Enter your Pushover **User Key** and **App Token** from Step 1.
4. Optionally change the **Notification Cooldown** (seconds). This controls how long the extension waits before re-sending a notification for the same rule on the same tab. Defaults to `3600` (1 hour).
5. Click **Save Credentials**.

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
2. Within a few seconds you should receive a Pushover notification on your device.
3. If nothing arrives, check the service worker logs at `chrome://extensions` → **Inspect views: service worker**.

## Notification priority

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

Each Pushover notification includes:

- **Title:** the rule label (or the selector if no label is set)
- **Message:** the page title, the matched element's visible text (up to 200 characters), and the page URL
- **Link:** a direct link back to the page

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

## Development notes

- No build step or bundler is required — all files are plain vanilla JavaScript loaded directly by Chrome.
- Rule, credential, and cooldown data are stored in `chrome.storage.sync`, so they sync across devices signed into the same Chrome profile.
- Auto-refresh state is stored in `chrome.storage.session` (ephemeral, per-session) and auto-refresh alarms are named `refresh-{tabId}`. Both are cleaned up automatically when the tab closes or the browser restarts.
- The deduplication key is `tabId:ruleId`, stored with a timestamp. A notification is suppressed only while `Date.now() - lastSent < cooldownMs`; once the window passes the notification fires again automatically.
- The content script sets a `setInterval` at the configured cooldown interval so elements that are already present in the DOM (and don't trigger a `MutationObserver` event) are still re-checked and re-notified.
- The Pushover API call is made from the background service worker to avoid CORS issues.

## Troubleshooting

| Problem | Solution |
|---|---|
| No notification received | Open Settings and verify both Pushover credentials are saved. Check the service worker console at `chrome://extensions` → *Inspect views: service worker*. |
| "Invalid CSS selector" error | Test your selector in the browser DevTools console: `document.querySelector('your-selector')`. |
| Notification fires only once then stops | Check the cooldown setting in Settings — the default is 1 hour. Lower it to get more frequent notifications. |
| Page is not refreshing automatically | Open the popup and confirm the Auto-Refresh status shows green. If the tab was closed and reopened, auto-refresh must be re-enabled — it does not persist across browser restarts. |
| Auto-refresh interval shorter than expected | Chrome enforces a minimum alarm period of approximately 30–60 seconds for extensions. |
| Extension not loading | Ensure the `icons/` folder contains all three PNG files, then reload the extension at `chrome://extensions`. |

## Privacy

All data (credentials and rules) is stored locally in your Chrome profile via `chrome.storage.sync`. The only external network call made is to `api.pushover.net` when a monitored element is detected.
