const STORAGE_KEY = "todos";

function remainingCount(todos) {
  if (!Array.isArray(todos)) return 0;
  return todos.filter((todo) => todo && typeof todo.text === "string" && !todo.done).length;
}

function badgeText(count) {
  if (!count) return "";
  if (count > 99) return "99+";
  return String(count);
}

async function updateBadge() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const text = badgeText(remainingCount(data[STORAGE_KEY]));
  await chrome.action.setBadgeBackgroundColor({ color: "#e23d2b" });
  if (chrome.action.setBadgeTextColor) {
    try {
      await chrome.action.setBadgeTextColor({ color: "#ffffff" });
    } catch {
      // Older Chrome builds expose the method but reject the call.
    }
  }
  await chrome.action.setBadgeText({ text });
}

chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) updateBadge();
});
