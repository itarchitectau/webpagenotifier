const PUSHOVER_API_URL = "https://api.pushover.net/1/messages.json";
const TELEGRAM_API_BASE = "https://api.telegram.org";
const DEFAULT_DEDUPE_INTERVAL_SECS = 3600;
const UA_RULE_ID = 1;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get("rules", (data) => {
    if (!data.rules) {
      chrome.storage.sync.set({ rules: [] });
    }
  });
  updateUserAgentRule();
});

chrome.runtime.onStartup.addListener(() => {
  updateUserAgentRule();
});

async function updateUserAgentRule() {
  const { userAgent = "" } = await chrome.storage.sync.get("userAgent");
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [UA_RULE_ID],
    addRules: userAgent ? [{
      id: UA_RULE_ID,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{ header: "User-Agent", operation: "set", value: userAgent }],
      },
      condition: {
        urlFilter: "*",
        resourceTypes: ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "media", "websocket", "csp_report", "other"],
      },
    }] : [],
  });
}

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
    telegramBotToken,
    telegramChatId,
    notificationChannel = "pushover",
    sentNotifications = {},
    dedupeIntervalSecs = DEFAULT_DEDUPE_INTERVAL_SECS,
    quietHoursEnabled,
    quietHoursStart = "22:00",
    quietHoursEnd = "07:00",
  } = await chrome.storage.sync.get([
    "pushoverUserKey",
    "pushoverAppToken",
    "telegramBotToken",
    "telegramChatId",
    "notificationChannel",
    "sentNotifications",
    "dedupeIntervalSecs",
    "quietHoursEnabled",
    "quietHoursStart",
    "quietHoursEnd",
  ]);

  // Time-based deduplication: skip if last notification for this rule+tab is within the cooldown window
  const dedupeKey = `${tab.id}:${ruleId}`;
  const lastSent = sentNotifications[dedupeKey];
  if (lastSent && Date.now() - lastSent < dedupeIntervalSecs * 1000) return;

  if (quietHoursEnabled && isInQuietHours(quietHoursStart, quietHoursEnd)) {
    console.log("[Notifier] Quiet hours active — notification suppressed.");
    return;
  }

  const title = ruleLabel || `Element found: ${selector}`;
  const lines = [
    `Page: ${tab.title || tab.url}`,
    matchedText ? `Text: ${matchedText.slice(0, 200)}` : null,
    `URL: ${tab.url}`,
  ].filter(Boolean);

  let succeeded = false;
  if (notificationChannel === "pushover") {
    if (!pushoverUserKey || !pushoverAppToken) {
      console.warn("[Notifier] Pushover credentials not configured.");
      return;
    }
    succeeded = await sendPushover({ token: pushoverAppToken, user: pushoverUserKey, title, lines, url: tab.url, priority, retry, expire });
  } else if (notificationChannel === "telegram") {
    if (!telegramBotToken || !telegramChatId) {
      console.warn("[Notifier] Telegram credentials not configured.");
      return;
    }
    succeeded = await sendTelegram({ botToken: telegramBotToken, chatId: telegramChatId, title, lines, url: tab.url });
  }

  if (succeeded) {
    sentNotifications[dedupeKey] = Date.now();
    await chrome.storage.sync.set({ sentNotifications });
    console.log("[Notifier] Notification sent for rule:", ruleId);
  }
}

async function sendPushover({ token, user, title, lines, url, priority, retry, expire }) {
  try {
    const resp = await fetch(PUSHOVER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        user,
        title,
        message: lines.join("\n"),
        url,
        url_title: "Open page",
        priority: priority ?? 0,
        ...(priority === 2 && { retry: retry ?? 60, expire: expire ?? 3600 }),
      }),
    });
    if (!resp.ok) {
      console.error("[Notifier] Pushover error:", await resp.json().catch(() => ({})));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[Notifier] Pushover request failed:", e);
    return false;
  }
}

async function sendTelegram({ botToken, chatId, title, lines, url }) {
  const text = [
    `<b>${escHtml(title)}</b>`,
    ...lines.map(escHtml),
    `<a href="${escHtml(url)}">Open page</a>`,
  ].join("\n");

  try {
    const resp = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!resp.ok) {
      console.error("[Notifier] Telegram error:", await resp.json().catch(() => ({})));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[Notifier] Telegram request failed:", e);
    return false;
  }
}

function isInQuietHours(start, end) {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  if (startMins === endMins) return false;
  if (startMins < endMins) return current >= startMins && current < endMins;
  // spans midnight
  return current >= startMins || current < endMins;
}

function escHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function looksLikeLoginRedirect(expectedUrl, currentUrl) {
  try {
    const expected = new URL(expectedUrl);
    const current = new URL(currentUrl);
    if (current.origin !== expected.origin) return true;
    const p = current.pathname.toLowerCase();
    return ["/login", "/signin", "/sign-in", "/auth", "/sso", "/saml"].some(t => p.includes(t));
  } catch {
    return false;
  }
}

async function handleSessionExpired(tabId, tab) {
  const {
    pushoverUserKey,
    pushoverAppToken,
    telegramBotToken,
    telegramChatId,
    notificationChannel = "pushover",
    sentNotifications = {},
    dedupeIntervalSecs = DEFAULT_DEDUPE_INTERVAL_SECS,
  } = await chrome.storage.sync.get([
    "pushoverUserKey", "pushoverAppToken",
    "telegramBotToken", "telegramChatId",
    "notificationChannel", "sentNotifications", "dedupeIntervalSecs",
  ]);

  const dedupeKey = `${tabId}:session-expired`;
  const lastSent = sentNotifications[dedupeKey];
  if (lastSent && Date.now() - lastSent < dedupeIntervalSecs * 1000) return;

  const title = "Session expired";
  const lines = [
    `Tab: ${tab.title || tab.url}`,
    `Redirected to: ${tab.url}`,
    "Your session has expired — re-open the tab to log in again.",
  ];

  let succeeded = false;
  if (notificationChannel === "pushover") {
    if (!pushoverUserKey || !pushoverAppToken) {
      console.warn("[Notifier] Pushover credentials not configured.");
      return;
    }
    // Priority 1 (High) bypasses Pushover quiet hours — session expiry needs prompt attention
    succeeded = await sendPushover({ token: pushoverAppToken, user: pushoverUserKey, title, lines, url: tab.url, priority: 1 });
  } else if (notificationChannel === "telegram") {
    if (!telegramBotToken || !telegramChatId) {
      console.warn("[Notifier] Telegram credentials not configured.");
      return;
    }
    succeeded = await sendTelegram({ botToken: telegramBotToken, chatId: telegramChatId, title, lines, url: tab.url });
  }

  if (succeeded) {
    sentNotifications[dedupeKey] = Date.now();
    await chrome.storage.sync.set({ sentNotifications });
    console.log("[Notifier] Session expiry notification sent for tab:", tabId);
  }
}

// Auto-refresh: reload tab on alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("refresh-")) return;
  const tabId = parseInt(alarm.name.slice(8), 10);
  if (isNaN(tabId)) return;
  try {
    await chrome.tabs.reload(tabId);
  } catch {
    // Tab was closed; clean up orphaned alarm and session state
    chrome.alarms.clear(alarm.name);
    const { tabRefresh = {} } = await chrome.storage.session.get("tabRefresh");
    delete tabRefresh[tabId];
    chrome.storage.session.set({ tabRefresh });
  }
});

// Clear deduplication entries and re-inject UA override when a tab navigates;
// check for session expiry once the page has fully loaded.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    clearTabDedupeEntries(tabId);

    const { userAgent = "" } = await chrome.storage.sync.get("userAgent");
    if (userAgent) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          world: "MAIN",
          func: (ua) => {
            Object.defineProperty(navigator, "userAgent", { get: () => ua, configurable: true });
          },
          args: [userAgent],
          injectImmediately: true,
        });
      } catch {
        // Tab may not be injectable (e.g. chrome:// pages)
      }
    }
  }

  if (changeInfo.status === "complete" && tab.url) {
    const { tabRefresh = {} } = await chrome.storage.session.get("tabRefresh");
    const refreshState = tabRefresh[tabId];
    if (refreshState?.url && looksLikeLoginRedirect(refreshState.url, tab.url)) {
      await handleSessionExpired(tabId, tab);
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  clearTabDedupeEntries(tabId);
  chrome.alarms.clear(`refresh-${tabId}`);
  const { tabRefresh = {} } = await chrome.storage.session.get("tabRefresh");
  if (tabId in tabRefresh) {
    delete tabRefresh[tabId];
    chrome.storage.session.set({ tabRefresh });
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.userAgent) updateUserAgentRule();
});

async function clearTabDedupeEntries(tabId) {
  const { sentNotifications = {} } = await chrome.storage.sync.get("sentNotifications");
  const prefix = `${tabId}:`;
  const updated = Object.fromEntries(
    Object.entries(sentNotifications).filter(([k]) => !k.startsWith(prefix))
  );
  await chrome.storage.sync.set({ sentNotifications: updated });
}
