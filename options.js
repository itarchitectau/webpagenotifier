const $ = (id) => document.getElementById(id);

const PRIORITY_LABELS = { "0": "Normal", "1": "High", "2": "Emergency" };

const USER_AGENTS = [
  { label: "Default (no override)", value: "" },
  { label: "Chrome 124 — Windows 11", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
  { label: "Chrome 124 — macOS", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
  { label: "Chrome 124 — Linux", value: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
  { label: "Firefox 125 — Windows", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0" },
  { label: "Firefox 125 — macOS", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0" },
  { label: "Safari 17 — macOS", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15" },
  { label: "Edge 124 — Windows", value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0" },
  { label: "Safari — iPhone (iOS 17)", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1" },
  { label: "Chrome — Android (Pixel 8)", value: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36" },
  { label: "Googlebot 2.1", value: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
  { label: "Custom…", value: "__custom__" },
];

const CONFIG_KEYS = [
  "userAgent",
  "notificationChannel",
  "pushoverUserKey", "pushoverAppToken",
  "telegramBotToken", "telegramChatId",
  "dedupeIntervalSecs",
  "quietHoursEnabled", "quietHoursStart", "quietHoursEnd",
  "rules",
];

let rules = [];

function buildUaPreset() {
  const sel = $("uaPreset");
  sel.innerHTML = USER_AGENTS.map((ua) =>
    `<option value="${escHtml(ua.value)}">${escHtml(ua.label)}</option>`
  ).join("");
}

function updateUaCustomField() {
  $("uaCustomField").style.display = $("uaPreset").value === "__custom__" ? "" : "none";
}

function loadUserAgentField(stored) {
  buildUaPreset();
  const preset = USER_AGENTS.find((ua) => ua.value === stored && ua.value !== "__custom__");
  if (!stored) {
    $("uaPreset").value = "";
  } else if (preset) {
    $("uaPreset").value = stored;
  } else {
    $("uaPreset").value = "__custom__";
    $("uaCustom").value = stored;
  }
  updateUaCustomField();
}

function updateChannelFields() {
  const channel = $("notificationChannel").value;
  $("pushoverFields").style.display = channel === "pushover" ? "" : "none";
  $("telegramFields").style.display = channel === "telegram" ? "" : "none";
}

function updateQuietHoursFields() {
  $("quietHoursFields").style.display = $("quietHoursEnabled").checked ? "" : "none";
}

async function load() {
  const data = await chrome.storage.sync.get([
    "userAgent",
    "pushoverUserKey", "pushoverAppToken",
    "telegramBotToken", "telegramChatId",
    "notificationChannel", "dedupeIntervalSecs", "rules",
    "quietHoursEnabled", "quietHoursStart", "quietHoursEnd",
  ]);
  loadUserAgentField(data.userAgent || "");
  $("notificationChannel").value = data.notificationChannel || "pushover";
  $("userKey").value = data.pushoverUserKey || "";
  $("appToken").value = data.pushoverAppToken || "";
  $("telegramBotToken").value = data.telegramBotToken || "";
  $("telegramChatId").value = data.telegramChatId || "";
  $("dedupeIntervalSecs").value = data.dedupeIntervalSecs ?? 3600;
  $("quietHoursEnabled").checked = data.quietHoursEnabled || false;
  $("quietHoursStart").value = data.quietHoursStart || "22:00";
  $("quietHoursEnd").value = data.quietHoursEnd || "07:00";
  rules = data.rules || [];
  updateChannelFields();
  updateQuietHoursFields();
  renderRules();
}

function renderRules() {
  const list = $("rulesList");
  if (rules.length === 0) {
    list.innerHTML = '<p class="hint">No rules yet.</p>';
    return;
  }
  list.innerHTML = rules
    .map(
      (r) => `
    <div class="rule-item ${r.enabled === false ? "disabled" : ""}">
      <div class="rule-info">
        <strong>${escHtml(r.label || "(unlabelled)")}</strong>
        <code>${escHtml(r.selector)}</code>
        <span class="priority-badge priority-${r.priority ?? 0}">${PRIORITY_LABELS[r.priority ?? 0]}</span>
      </div>
      <div class="rule-actions">
        <button data-edit="${r.id}">Edit</button>
        <button data-toggle="${r.id}" class="secondary">${r.enabled === false ? "Enable" : "Disable"}</button>
        <button data-delete="${r.id}" class="danger">Delete</button>
      </div>
    </div>`
    )
    .join("");

  list.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => startEdit(btn.dataset.edit))
  );
  list.querySelectorAll("[data-toggle]").forEach((btn) =>
    btn.addEventListener("click", () => toggleRule(btn.dataset.toggle))
  );
  list.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () => deleteRule(btn.dataset.delete))
  );
}

function startEdit(id) {
  const rule = rules.find((r) => r.id === id);
  if (!rule) return;
  $("editRuleId").value = rule.id;
  $("ruleLabel").value = rule.label || "";
  $("ruleSelector").value = rule.selector;
  $("rulePriority").value = rule.priority ?? 0;
  $("ruleRetry").value = rule.retry ?? 60;
  $("ruleExpire").value = rule.expire ?? 3600;
  $("emergencyFields").style.display = String(rule.priority) === "2" ? "" : "none";
  $("ruleEnabled").checked = rule.enabled !== false;
  $("cancelEdit").style.display = "";
  $("ruleStatus").textContent = "";
}

function cancelEdit() {
  $("editRuleId").value = "";
  $("ruleLabel").value = "";
  $("ruleSelector").value = "";
  $("rulePriority").value = "0";
  $("ruleRetry").value = 60;
  $("ruleExpire").value = 3600;
  $("emergencyFields").style.display = "none";
  $("ruleEnabled").checked = true;
  $("cancelEdit").style.display = "none";
  $("ruleStatus").textContent = "";
}

async function saveRule() {
  const selector = $("ruleSelector").value.trim();
  if (!selector) {
    showStatus("ruleStatus", "CSS selector is required.", "error");
    return;
  }
  try {
    document.querySelector(selector);
  } catch {
    showStatus("ruleStatus", "Invalid CSS selector.", "error");
    return;
  }

  const priority = parseInt($("rulePriority").value, 10);
  if (priority === 2) {
    const retry = parseInt($("ruleRetry").value, 10);
    const expire = parseInt($("ruleExpire").value, 10);
    if (isNaN(retry) || retry < 30) {
      showStatus("ruleStatus", "Retry interval must be at least 30 seconds.", "error");
      return;
    }
    if (isNaN(expire) || expire < 30 || expire > 10800) {
      showStatus("ruleStatus", "Expire must be between 30 and 10800 seconds.", "error");
      return;
    }
  }

  const id = $("editRuleId").value || crypto.randomUUID();
  const rule = {
    id,
    label: $("ruleLabel").value.trim(),
    selector,
    priority,
    ...(priority === 2 && {
      retry: parseInt($("ruleRetry").value, 10),
      expire: parseInt($("ruleExpire").value, 10),
    }),
    enabled: $("ruleEnabled").checked,
  };

  const idx = rules.findIndex((r) => r.id === id);
  if (idx >= 0) {
    rules[idx] = rule;
  } else {
    rules.push(rule);
  }

  await chrome.storage.sync.set({ rules });
  cancelEdit();
  renderRules();
  showStatus("ruleStatus", "Rule saved.", "ok");
}

async function toggleRule(id) {
  rules = rules.map((r) => (r.id === id ? { ...r, enabled: r.enabled === false } : r));
  await chrome.storage.sync.set({ rules });
  renderRules();
}

async function deleteRule(id) {
  rules = rules.filter((r) => r.id !== id);
  await chrome.storage.sync.set({ rules });
  renderRules();
}

async function saveCredentials() {
  const notificationChannel = $("notificationChannel").value;
  const pushoverUserKey = $("userKey").value.trim();
  const pushoverAppToken = $("appToken").value.trim();
  const telegramBotToken = $("telegramBotToken").value.trim();
  const telegramChatId = $("telegramChatId").value.trim();
  const dedupeIntervalSecs = Math.max(1, parseInt($("dedupeIntervalSecs").value, 10) || 3600);
  $("dedupeIntervalSecs").value = dedupeIntervalSecs;
  await chrome.storage.sync.set({ notificationChannel, pushoverUserKey, pushoverAppToken, telegramBotToken, telegramChatId, dedupeIntervalSecs });
  showStatus("credStatus", "Credentials saved.", "ok");
}

function showStatus(id, msg, type) {
  const el = $(id);
  el.textContent = msg;
  el.className = "status " + type;
  setTimeout(() => (el.textContent = ""), 3000);
}

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function saveQuietHours() {
  const quietHoursEnabled = $("quietHoursEnabled").checked;
  const quietHoursStart = $("quietHoursStart").value || "22:00";
  const quietHoursEnd = $("quietHoursEnd").value || "07:00";
  await chrome.storage.sync.set({ quietHoursEnabled, quietHoursStart, quietHoursEnd });
  showStatus("quietHoursStatus", "Quiet hours saved.", "ok");
}

async function saveUserAgent() {
  const preset = $("uaPreset").value;
  const userAgent = preset === "__custom__" ? $("uaCustom").value.trim() : preset;
  await chrome.storage.sync.set({ userAgent });
  showStatus("uaStatus", userAgent ? "User agent saved." : "User agent reset to default.", "ok");
}

async function exportDaemonConfig() {
  const data = await chrome.storage.sync.get(CONFIG_KEYS);
  const rules = (data.rules ?? []).map(({ id, label, selector, priority, retry, expire, enabled }) => ({
    id,
    label: label || "",
    selector,
    priority: priority ?? 0,
    ...(priority === 2 && { retry: retry ?? 60, expire: expire ?? 3600 }),
    enabled: enabled !== false,
  }));

  const payload = JSON.stringify({
    url: "https://",
    checkIntervalSecs: 60,
    storageStatePath: "",
    notificationChannel: data.notificationChannel || "pushover",
    pushoverUserKey: data.pushoverUserKey || "",
    pushoverAppToken: data.pushoverAppToken || "",
    telegramBotToken: data.telegramBotToken || "",
    telegramChatId: data.telegramChatId || "",
    dedupeIntervalSecs: data.dedupeIntervalSecs ?? 3600,
    quietHoursEnabled: data.quietHoursEnabled || false,
    quietHoursStart: data.quietHoursStart || "22:00",
    quietHoursEnd: data.quietHoursEnd || "07:00",
    userAgent: data.userAgent || "",
    rules,
  }, null, 2);

  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "page-notifier-daemon-config.json";
  a.click();
  URL.revokeObjectURL(url);
  $("daemonExportHint").style.display = "";
  showStatus("exportImportStatus", "Daemon configuration exported.", "ok");
}

async function exportConfig() {
  const data = await chrome.storage.sync.get(CONFIG_KEYS);
  const payload = JSON.stringify({ version: 1, exported: new Date().toISOString(), config: data }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "page-notifier-config.json";
  a.click();
  URL.revokeObjectURL(url);
  showStatus("exportImportStatus", "Configuration exported.", "ok");
}

async function importConfig() {
  const file = $("importFile").files[0];
  if (!file) {
    showStatus("exportImportStatus", "Please select a file first.", "error");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    showStatus("exportImportStatus", "Invalid JSON file.", "error");
    return;
  }

  const config = parsed.config ?? parsed;
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    showStatus("exportImportStatus", "Unrecognised configuration format.", "error");
    return;
  }

  const toImport = {};
  for (const key of CONFIG_KEYS) {
    if (key in config) toImport[key] = config[key];
  }

  if (Object.keys(toImport).length === 0) {
    showStatus("exportImportStatus", "No recognised settings found in file.", "error");
    return;
  }

  if (!confirm("This will overwrite all current settings and rules. Continue?")) return;

  await chrome.storage.sync.set(toImport);
  showStatus("exportImportStatus", "Configuration imported — reloading settings…", "ok");
  setTimeout(load, 1000);
}

$("exportDaemonConfig").addEventListener("click", exportDaemonConfig);
$("saveUserAgent").addEventListener("click", saveUserAgent);
$("uaPreset").addEventListener("change", updateUaCustomField);
$("exportConfig").addEventListener("click", exportConfig);
$("importConfig").addEventListener("click", importConfig);
$("saveCredentials").addEventListener("click", saveCredentials);
$("notificationChannel").addEventListener("change", updateChannelFields);
$("quietHoursEnabled").addEventListener("change", updateQuietHoursFields);
$("saveQuietHours").addEventListener("click", saveQuietHours);
$("saveRule").addEventListener("click", saveRule);
$("cancelEdit").addEventListener("click", cancelEdit);
$("rulePriority").addEventListener("change", () => {
  $("emergencyFields").style.display = $("rulePriority").value === "2" ? "" : "none";
});

load();
