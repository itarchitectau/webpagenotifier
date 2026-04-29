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

render();
