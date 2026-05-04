// Runs at document_start to override navigator.userAgent in the page's JS context
// before page scripts execute. The HTTP header is handled separately via declarativeNetRequest.
(async () => {
  const { userAgent = "" } = await chrome.storage.sync.get("userAgent");
  if (!userAgent) return;
  const s = document.createElement("script");
  s.textContent = `Object.defineProperty(navigator,'userAgent',{get:()=>${JSON.stringify(userAgent)},configurable:true});`;
  (document.head || document.documentElement).appendChild(s);
  s.remove();
})();
