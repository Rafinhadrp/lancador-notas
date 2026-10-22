// Mascote <R/> na tela do Autos 360, do WhatsApp Web, do Detran e do IPVA (só nesses sites).
// Mostra o mesmo humor do painel; dá para arrastar (lembra o lugar em cada site) e esconder com duplo clique.
(() => {
  if (window.top !== window || document.getElementById('lancador-mascote')) return;
  const HOST = location.hostname;
  const TAM = 64;
  // no WhatsApp o canto de baixo à direita é o botão de enviar: começa à esquerda
  const PADRAO = HOST === 'web.whatsapp.com' ? { lado: 'esquerda', x: 14, y: 14 } : { lado: 'direita', x: 18, y: 18 };

  const host = document.createElement('div');
  host.id = 'lancador-mascote';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483000; width: 0; height: 0;';
  const raiz = host.attachShadow({ mode: 'closed' });
  raiz.innerHTML = `
    <style>
      .m { position: fixed; width: ${TAM}px; height: ${TAM}px; cursor: grab; user-select: none; -webkit-user-drag: none;
           image-rendering: pixelated; filter: drop-shadow(0 6px 6px rgba(0,0,0,.35)); transition: transform .15s; touch-action: none; }
      .m:hover { transform: translateY(-2px); }
      .m.arrastando { cursor: grabbing; transition: none; }
      .b { position: fixed; max-width: 240px; background: #141b23; color: #e8eef5; border: 1px solid #2e3d50; border-radius: 12px;
           padding: 8px 11px; font: 12.5px/1.4 "Segoe UI", system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.35);
           opacity: 0; transform: translateY(4px); transition: opacity .15s, transform .15s; pointer-events: none; }
      .b.ver { opacity: 1; transform: none; }
      .b strong { display: block; font-size: 13px; margin-bottom: 2px; }
      .b span { color: #93a1b2; }
      .b small { display: block; color: #66758a; margin-top: 6px; font-size: 11px; }
    </style>
    <img class="m" alt="Lançador" draggable="false">
    <div class="b"><strong></strong><span></span><small>Arraste para mudar de lugar · duplo clique para esconder neste site</small></div>`;
  const img = raiz.querySelector('.m'), balao = raiz.querySelector('.b');

  let pos = { ...PADRAO }, estado = '';

  function aplicarPosicao() {
    const maxX = Math.max(0, innerWidth - TAM), maxY = Math.max(0, innerHeight - TAM);
    pos.x = Math.min(Math.max(0, pos.x), maxX);
    pos.y = Math.min(Math.max(0, pos.y), maxY);
    img.style.left = pos.lado === 'esquerda' ? pos.x + 'px' : 'auto';
    img.style.right = pos.lado === 'direita' ? pos.x + 'px' : 'auto';
    img.style.bottom = pos.y + 'px';
  }

  function posicionarBalao() {
    const r = img.getBoundingClientRect();
    const larg = balao.offsetWidth || 220, alt = balao.offsetHeight || 60;
    let left = r.left + r.width / 2 - larg / 2;
    left = Math.min(Math.max(8, left), innerWidth - larg - 8);
    const top = r.top - alt - 8 > 8 ? r.top - alt - 8 : r.bottom + 8;
    balao.style.left = left + 'px';
    balao.style.top = top + 'px';
  }

  function mostrarEstado(e) {
    const ok = e && ['parado', 'digitando', 'feliz', 'acenando', 'pensando', 'dormindo', 'erro'].includes(e.estado);
    const novo = ok ? e.estado : 'dormindo';
    if (novo !== estado) { estado = novo; img.src = chrome.runtime.getURL(`mascote/${estado}.gif`); }
    balao.querySelector('strong').textContent = (e && e.titulo) || 'Painel fechado';
    balao.querySelector('span').textContent = (e && e.sub) || 'Abra o painel da extensão para as consultas e os avisos funcionarem.';
  }

  // ---------------------------------------------------------------- arrastar
  let arraste = null;
  img.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const r = img.getBoundingClientRect();
    arraste = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, moveu: false };
    img.setPointerCapture(ev.pointerId);
    img.classList.add('arrastando');
    balao.classList.remove('ver');
  });
  img.addEventListener('pointermove', (ev) => {
    if (!arraste) return;
    arraste.moveu = true;
    const left = ev.clientX - arraste.dx, top = ev.clientY - arraste.dy;
    pos.lado = left + TAM / 2 < innerWidth / 2 ? 'esquerda' : 'direita';
    pos.x = pos.lado === 'esquerda' ? left : innerWidth - left - TAM;
    pos.y = innerHeight - top - TAM;
    aplicarPosicao();
  });
  img.addEventListener('pointerup', () => {
    if (!arraste) return;
    img.classList.remove('arrastando');
    if (arraste.moveu) chrome.storage.local.get('mascotePos', ({ mascotePos }) => {
      chrome.storage.local.set({ mascotePos: { ...(mascotePos || {}), [HOST]: pos } });
    });
    arraste = null;
  });
  img.addEventListener('mouseenter', () => { if (!arraste) { posicionarBalao(); balao.classList.add('ver'); } });
  img.addEventListener('mouseleave', () => balao.classList.remove('ver'));
  img.addEventListener('dblclick', () => {
    chrome.storage.local.get('mascoteOculto', ({ mascoteOculto }) => {
      chrome.storage.local.set({ mascoteOculto: { ...(mascoteOculto || {}), [HOST]: true } });
    });
  });
  addEventListener('resize', aplicarPosicao);

  // ---------------------------------------------------------------- liga/desliga e humor
  function atualizar({ painelEstado, mascotePos, mascoteOculto }) {
    if (mascotePos !== undefined) { pos = { ...PADRAO, ...((mascotePos || {})[HOST] || {}) }; aplicarPosicao(); }
    if (painelEstado !== undefined) mostrarEstado(painelEstado);
    if (mascoteOculto !== undefined) host.style.display = (mascoteOculto || {})[HOST] ? 'none' : '';
  }
  chrome.storage.local.get(['painelEstado', 'mascotePos', 'mascoteOculto'], (d) => {
    atualizar({ painelEstado: d.painelEstado || null, mascotePos: d.mascotePos || {}, mascoteOculto: d.mascoteOculto || {} });
    (document.body || document.documentElement).appendChild(host);
  });
  chrome.storage.onChanged.addListener((mud, area) => {
    if (area !== 'local') return;
    const d = {};
    for (const k of ['painelEstado', 'mascotePos', 'mascoteOculto']) if (mud[k]) d[k] = mud[k].newValue || (k === 'painelEstado' ? null : {});
    if (Object.keys(d).length) atualizar(d);
  });
})();
