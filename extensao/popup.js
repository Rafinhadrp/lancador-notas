document.getElementById('abrir').onclick = async () => {
  const url = chrome.runtime.getURL('painel.html');
  const [t] = await chrome.tabs.query({ url });
  if (t) {
    await chrome.tabs.update(t.id, { active: true });
    await chrome.windows.update(t.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url, index: 0, pinned: true });
  }
  window.close();
};
