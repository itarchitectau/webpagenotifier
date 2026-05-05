function isInQuietHours(start, end) {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  if (startMins === endMins) return false;
  if (startMins < endMins) return current >= startMins && current < endMins;
  return current >= startMins || current < endMins;
}

async function render() {
  const {
    rules = [],
    notificationChannel = "pushover",
    pushoverUserKey, pushoverAppToken,
    telegramBotToken, telegramChatId,
    quietHoursEnabled, quietHoursStart = "22:00", quietHoursEnd = "07:00",
    userAgent = "",
  } = await chrome.storage.sync.get([
    "rules", "notificationChannel",
    "pushoverUserKey", "pushoverAppToken",
    "telegramBotToken", "telegramChatId",
    "quietHoursEnabled", "quietHoursStart", "quietHoursEnd",
    "userAgent",
  ]);

  const summary = document.getElementById("summary");
  const activeRules = rules.filter((r) => r.enabled !== false);

  let credOk, channelLabel;
  if (notificationChannel === "telegram") {
    credOk = telegramBotToken && telegramChatId;
    channelLabel = "Telegram";
  } else {
    credOk = pushoverUserKey && pushoverAppToken;
    channelLabel = "Pushover";
  }

  const quietNow = quietHoursEnabled && isInQuietHours(quietHoursStart, quietHoursEnd);

  summary.innerHTML = `
    <p class="${credOk ? "ok" : "error"}">
      ${channelLabel}: ${credOk ? "Configured" : "Not configured"}
    </p>
    ${quietNow ? `<p class="error">Quiet hours active (${esc(quietHoursStart)}–${esc(quietHoursEnd)}) — notifications paused</p>` : ""}
    ${userAgent ? `<p class="hint" style="margin-bottom:4px">UA override active</p>` : ""}
    <p>${activeRules.length} active rule${activeRules.length !== 1 ? "s" : ""}</p>
    ${
      activeRules.length > 0
        ? `<ul>${activeRules.map((r) => `<li><code>${esc(r.selector)}</code>${r.label ? ` — ${esc(r.label)}` : ""}</li>`).join("")}</ul>`
        : ""
    }
  `;
}

function esc(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// --- Auto-refresh ---

let currentTabId = null;

async function renderRefresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;

  const { tabRefresh = {} } = await chrome.storage.session.get("tabRefresh");
  const state = tabRefresh[currentTabId];

  const statusEl = document.getElementById("refreshStatus");
  const enableBtn = document.getElementById("enableRefresh");
  const disableBtn = document.getElementById("disableRefresh");
  const intervalInput = document.getElementById("refreshInterval");

  if (state) {
    statusEl.textContent = `Active — every ${state.intervalSecs}s`;
    statusEl.className = "status ok";
    intervalInput.value = state.intervalSecs;
    enableBtn.textContent = "Update";
    disableBtn.style.display = "";
  } else {
    statusEl.textContent = "Disabled";
    statusEl.className = "status";
    enableBtn.textContent = "Enable";
    disableBtn.style.display = "none";
  }
}

async function enableRefresh() {
  if (currentTabId === null) return;
  const intervalSecs = Math.max(30, parseInt(document.getElementById("refreshInterval").value, 10) || 60);
  document.getElementById("refreshInterval").value = intervalSecs;

  const tab = await chrome.tabs.get(currentTabId);
  const { tabRefresh = {} } = await chrome.storage.session.get("tabRefresh");
  tabRefresh[currentTabId] = { intervalSecs, url: tab.url };
  await chrome.storage.session.set({ tabRefresh });

  await chrome.alarms.clear(`refresh-${currentTabId}`);
  chrome.alarms.create(`refresh-${currentTabId}`, {
    delayInMinutes: intervalSecs / 60,
    periodInMinutes: intervalSecs / 60,
  });

  await renderRefresh();
}

async function disableRefresh() {
  if (currentTabId === null) return;
  await chrome.alarms.clear(`refresh-${currentTabId}`);

  const { tabRefresh = {} } = await chrome.storage.session.get("tabRefresh");
  delete tabRefresh[currentTabId];
  await chrome.storage.session.set({ tabRefresh });

  await renderRefresh();
}

document.getElementById("enableRefresh").addEventListener("click", enableRefresh);
document.getElementById("disableRefresh").addEventListener("click", disableRefresh);

render();
renderRefresh();
