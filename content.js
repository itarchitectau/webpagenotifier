let rules = [];
let dedupeIntervalSecs = 3600;
let observer = null;
let recheckTimer = null;

// Tracks when each rule last triggered a notification in this page session
const lastNotified = new Map();

async function init() {
  const {
    rules: stored = [],
    dedupeIntervalSecs: interval = 3600,
  } = await chrome.storage.sync.get(["rules", "dedupeIntervalSecs"]);

  rules = stored.filter((r) => r.enabled !== false);
  dedupeIntervalSecs = interval;

  if (rules.length === 0) return;

  checkAll();

  observer = new MutationObserver(checkAll);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Re-check on the cooldown interval so elements already in the DOM re-notify after it expires
  clearInterval(recheckTimer);
  recheckTimer = setInterval(checkAll, dedupeIntervalSecs * 1000);
}

function checkAll() {
  for (const rule of rules) {
    checkRule(rule);
  }
}

function checkRule(rule) {
  // Skip if still within the cooldown window for this rule
  const lastSentAt = lastNotified.get(rule.id);
  if (lastSentAt && Date.now() - lastSentAt < dedupeIntervalSecs * 1000) return;

  let el = null;
  try {
    el = document.querySelector(rule.selector);
  } catch {
    return;
  }

  if (!el) return;

  lastNotified.set(rule.id, Date.now());

  chrome.runtime.sendMessage({
    type: "ELEMENT_FOUND",
    payload: {
      ruleId: rule.id,
      ruleLabel: rule.label,
      selector: rule.selector,
      matchedText: el.innerText || el.textContent || "",
      priority: rule.priority ?? 0,
      retry: rule.retry,
      expire: rule.expire,
    },
  });
}

// Re-initialise if rules or cooldown interval change while the content script is alive
chrome.storage.onChanged.addListener((changes) => {
  if (changes.rules || changes.dedupeIntervalSecs) {
    lastNotified.clear();
    observer?.disconnect();
    clearInterval(recheckTimer);
    init();
  }
});

init();
