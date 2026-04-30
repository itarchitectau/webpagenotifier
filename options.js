const $ = (id) => document.getElementById(id);

const PRIORITY_LABELS = { "0": "Normal", "1": "High", "2": "Emergency" };

const CONFIG_KEYS = [
  "notificationChannel",
  "pushoverUserKey", "pushoverAppToken",
  "telegramBotToken", "telegramChatId",
  "dedupeIntervalSecs",
  "quietHoursEnabled", "quietHoursStart", "quietHoursEnd",
  "rules",
];

let rules = [];

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
    "pushoverUserKey", "pushoverAppToken",
    "telegramBotToken", "telegramChatId",
    "notificationChannel", "dedupeIntervalSecs", "rules",
    "quietHoursEnabled", "quietHoursStart", "quietHoursEnd",
  ]);
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
