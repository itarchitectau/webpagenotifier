const PUSHOVER_API_URL = "https://api.pushover.net/1/messages.json";
const DEFAULT_DEDUPE_INTERVAL_SECS = 3600;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get("rules", (data) => {
    if (!data.rules) {
      chrome.storage.sync.set({ rules: [] });
    }
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ELEMENT_FOUND") {
    handleElementFound(message.payload, sender.tab);
    sendResponse({ ok: true });
  }
});

async function handleElementFound({ ruleId, ruleLabel, selector, matchedText, priority, retry, expire }, tab) {
  const {
    pushoverUserKey,
    pushoverAppToken,
    sentNotifications = {},
    dedupeIntervalSecs = DEFAULT_DEDUPE_INTERVAL_SECS,
  } = await chrome.storage.sync.get([
    "pushoverUserKey",
    "pushoverAppToken",
    "sentNotifications",
    "dedupeIntervalSecs",
  ]);

  // Time-based deduplication: skip if last notification for this rule+tab is within the cooldown window
  const dedupeKey = `${tab.id}:${ruleId}`;
  const lastSent = sentNotifications[dedupeKey];
  if (lastSent && Date.now() - lastSent < dedupeIntervalSecs * 1000) return;

  if (!pushoverUserKey || !pushoverAppToken) {
    console.warn("[Notifier] Pushover credentials not configured.");
    return;
  }

  const title = ruleLabel || `Element found: ${selector}`;
  const body = [
    `Page: ${tab.title || tab.url}`,
    matchedText ? `Text: ${matchedText.slice(0, 200)}` : null,
    `URL: ${tab.url}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const resp = await fetch(PUSHOVER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: pushoverAppToken,
        user: pushoverUserKey,
        title,
        message: body,
        url: tab.url,
        url_title: "Open page",
        priority: priority ?? 0,
        ...(priority === 2 && {
          retry: retry ?? 60,
          expire: expire ?? 3600,
        }),
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error("[Notifier] Pushover error:", err);
      return;
    }

    sentNotifications[dedupeKey] = Date.now();
    await chrome.storage.sync.set({ sentNotifications });
    console.log("[Notifier] Notification sent for rule:", ruleId);
  } catch (e) {
    console.error("[Notifier] Failed to send Pushover notification:", e);
  }
}

// Clear deduplication entries when a tab navigates to a new URL or closes
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    clearTabDedupeEntries(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabDedupeEntries(tabId);
});

async function clearTabDedupeEntries(tabId) {
  const { sentNotifications = {} } = await chrome.storage.sync.get("sentNotifications");
  const prefix = `${tabId}:`;
  const updated = Object.fromEntries(
    Object.entries(sentNotifications).filter(([k]) => !k.startsWith(prefix))
  );
  await chrome.storage.sync.set({ sentNotifications: updated });
}
