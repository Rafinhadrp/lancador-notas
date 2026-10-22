const URL_PAINEL = chrome.runtime.getURL('painel.html');

(async () => {
  const [aberto] = await chrome.tabs.query({ url: URL_PAINEL });
  const { painelEstado } = await chrome.storage.local.get('painelEstado');
  const e = aberto && painelEstado ? painelEstado
    : { titulo: 'Painel fechado', sub: 'Abra o painel para as consultas e os avisos funcionarem.', estado: 'dormindo' };
  document.getElementById('titulo').textContent = e.titulo;
  document.getElementById('sub').textContent = e.sub;
  document.getElementById('mascote').src = `mascote/${e.estado || 'parado'}.gif`;
})();

document.getElementById('abrir').onclick = async () => {
  const [t] = await chrome.tabs.query({ url: URL_PAINEL });
  if (t) {
    await chrome.tabs.update(t.id, { active: true });
    await chrome.windows.update(t.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: URL_PAINEL, index: 0, pinned: true });
  }
  window.close();
};
