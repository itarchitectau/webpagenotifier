async function render() {
  const { rules = [], pushoverUserKey, pushoverAppToken } = await chrome.storage.sync.get([
    "rules",
    "pushoverUserKey",
    "pushoverAppToken",
  ]);

  const summary = document.getElementById("summary");
  const credOk = pushoverUserKey && pushoverAppToken;
  const activeRules = rules.filter((r) => r.enabled !== false);

  summary.innerHTML = `
    <p class="${credOk ? "ok" : "error"}">
      Pushover: ${credOk ? "Configured" : "Not configured"}
    </p>
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

  const { tabRefresh = {} } = await chrome.storage.session.get("tabRefresh");
  tabRefresh[currentTabId] = { intervalSecs };
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
