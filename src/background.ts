// MV3 service worker. The toolbar action opens the converter in a dedicated
// popup-type WINDOW instead of a dropdown popup, because a dropdown closes the
// moment it loses focus (e.g. the OS file picker, or clicking away) — which
// would drop the user's files mid-job. A real window persists until closed and
// can be positioned. If a Convertly window is already open, we just focus it.

const APP_URL = chrome.runtime.getURL('app.html');
const WIN_W = 880;
const WIN_H = 740;

async function openOrFocus(): Promise<void> {
  const wins = await chrome.windows.getAll({ populate: true });
  for (const w of wins) {
    const hit = w.tabs?.some((t) => t.url === APP_URL || t.pendingUrl === APP_URL);
    if (hit && w.id != null) {
      await chrome.windows.update(w.id, { focused: true, drawAttention: true });
      return;
    }
  }

  // Position near the top-right of the current browser window (the user asked
  // for it to appear further right, not pinned to the left edge).
  let left: number | undefined;
  let top: number | undefined;
  try {
    const cur = await chrome.windows.getCurrent();
    if (cur.left != null && cur.width != null) {
      left = Math.max(0, cur.left + cur.width - WIN_W - 60);
      top = (cur.top ?? 0) + 80;
    }
  } catch {
    /* no current window; let Chrome place it */
  }

  await chrome.windows.create({
    url: APP_URL,
    type: 'popup',
    width: WIN_W,
    height: WIN_H,
    left,
    top,
  });
}

chrome.action.onClicked.addListener(() => {
  void openOrFocus();
});
