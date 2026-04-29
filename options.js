const $ = (id) => document.getElementById(id);

const PRIORITY_LABELS = { "0": "Normal", "1": "High", "2": "Emergency" };

let rules = [];

async function load() {
  const data = await chrome.storage.sync.get(["pushoverUserKey", "pushoverAppToken", "dedupeIntervalSecs", "rules"]);
  $("userKey").value = data.pushoverUserKey || "";
  $("appToken").value = data.pushoverAppToken || "";
  $("dedupeIntervalSecs").value = data.dedupeIntervalSecs ?? 3600;
  rules = data.rules || [];
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
  const pushoverUserKey = $("userKey").value.trim();
  const pushoverAppToken = $("appToken").value.trim();
  const dedupeIntervalSecs = Math.max(1, parseInt($("dedupeIntervalSecs").value, 10) || 3600);
  $("dedupeIntervalSecs").value = dedupeIntervalSecs;
  await chrome.storage.sync.set({ pushoverUserKey, pushoverAppToken, dedupeIntervalSecs });
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

$("saveCredentials").addEventListener("click", saveCredentials);
$("saveRule").addEventListener("click", saveRule);
$("cancelEdit").addEventListener("click", cancelEdit);
$("rulePriority").addEventListener("change", () => {
  $("emergencyFields").style.display = $("rulePriority").value === "2" ? "" : "none";
});

load();
