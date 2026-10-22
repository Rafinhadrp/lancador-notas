// Mascote <R/> no painel e no ícone da extensão (canto do Chrome), animado e com o número da fila.
// Estados: parado (tudo em dia), digitando (trabalhando), feliz (acabou de concluir), dormindo (pausado),
// erro (precisa de você: login, QR code, sem conexão).
const Mascote = {
  estado: '', quadros: {}, tempos: null, tela16: null, tela32: null, i: 0, feliz: 0, fila: 0, alerta: false, timer: 0,

  async iniciar() {
    Mascote.tempos = await (await fetch('mascote/tempos.json')).json();
    Mascote.tela32 = new OffscreenCanvas(32, 32);
    Mascote.tela16 = new OffscreenCanvas(16, 16);
    for (const e of Object.keys(Mascote.tempos)) {
      const blob = await (await fetch(`mascote/${e}-32.png`)).blob();
      Mascote.quadros[e] = await createImageBitmap(blob);
    }
    Mascote.definir('parado');
    window.addEventListener('pagehide', () => {
      // painel fechado: ícone parado e "off" no lugar do número
      chrome.action.setIcon({ path: { 16: 'icones/mascote-16.png', 32: 'icones/mascote-32.png' } });
      chrome.action.setBadgeBackgroundColor({ color: '#66758a' });
      chrome.action.setBadgeText({ text: 'off' });
      chrome.storage.local.set({ painelEstado: { titulo: 'Painel fechado', sub: 'Abra o painel para as consultas e os avisos funcionarem.', estado: 'dormindo' } });
    });
  },

  // muda o humor; "feliz" dura 3 s e volta para o estado anterior
  definir(estado, { temporario = false } = {}) {
    if (!Mascote.tempos || !Mascote.tempos[estado]) return;
    if (temporario) { Mascote.feliz = Date.now() + 3000; }
    else if (Date.now() < Mascote.feliz && estado === 'parado') { Mascote.depois = estado; return; }
    if (estado === Mascote.estado) return;
    Mascote.estado = estado;
    Mascote.i = 0;
    const img = document.getElementById('stMascote');
    if (img) img.src = `mascote/${estado}.gif`;
    clearTimeout(Mascote.timer);
    Mascote.quadro();
  },

  quadro() {
    const e = Mascote.estado, folha = Mascote.quadros[e], tempos = Mascote.tempos[e];
    if (!folha) return;
    const n = tempos.length, i = Mascote.i % n;
    for (const [tela, t] of [[Mascote.tela32, 32], [Mascote.tela16, 16]]) {
      const ctx = tela.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, t, t);
      ctx.drawImage(folha, i * 32, 0, 32, 32, 0, 0, t, t);
    }
    chrome.action.setIcon({ imageData: {
      16: Mascote.tela16.getContext('2d').getImageData(0, 0, 16, 16),
      32: Mascote.tela32.getContext('2d').getImageData(0, 0, 32, 32),
    } }).catch(() => {});
    Mascote.i = i + 1;
    if (Mascote.feliz && Date.now() > Mascote.feliz) {
      Mascote.feliz = 0;
      const volta = Mascote.depois || 'parado';
      Mascote.depois = null;
      Mascote.estado = '';
      return Mascote.definir(volta);
    }
    Mascote.timer = setTimeout(Mascote.quadro, Math.max(80, tempos[i] || 120));
  },

  // número no canto do ícone: fila (consultas + avisos) ou "!" quando precisa de você
  selo({ fila, alerta } = {}) {
    if (fila !== undefined) Mascote.fila = fila;
    if (alerta !== undefined) Mascote.alerta = alerta;
    if (Mascote.alerta) {
      chrome.action.setBadgeBackgroundColor({ color: '#f07a6a' });
      chrome.action.setBadgeText({ text: '!' });
    } else {
      chrome.action.setBadgeBackgroundColor({ color: '#4f93f0' });
      chrome.action.setBadgeText({ text: Mascote.fila ? String(Mascote.fila) : '' });
    }
  },
};
