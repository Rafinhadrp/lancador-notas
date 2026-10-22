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

// Mostrar/esconder o mascote no site da aba atual (só nos sites onde ele aparece)
const SITES_MASCOTE = [/^app\.altimus\.com\.br$/, /^web\.whatsapp\.com$/, /\.detran\.sp\.gov\.br$/, /\.fazenda\.sp\.gov\.br$/];
(async () => {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { host = new URL(aba.url).hostname; } catch { return; }
  if (!SITES_MASCOTE.some((r) => r.test(host))) return;
  const bt = document.getElementById('mascoteSite');
  const pintar = (oculto) => { bt.textContent = oculto ? 'Mostrar o mascote neste site' : 'Esconder o mascote neste site'; };
  let { mascoteOculto } = await chrome.storage.local.get('mascoteOculto');
  mascoteOculto = mascoteOculto || {};
  pintar(!!mascoteOculto[host]);
  bt.hidden = false;
  bt.onclick = async () => {
    mascoteOculto = { ...mascoteOculto, [host]: !mascoteOculto[host] };
    await chrome.storage.local.set({ mascoteOculto });
    pintar(mascoteOculto[host]);
  };
})();
