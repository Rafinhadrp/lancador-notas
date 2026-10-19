// Funções que rodam DENTRO do WhatsApp Web (via chrome.scripting) para enviar os avisos de recibo.
// Cada uma é independente: o Chrome copia só o corpo da função para dentro da página.
let WHATS_URL = 'https://web.whatsapp.com';   // let: os testes automáticos trocam pelo WhatsApp falso

function waInspecionar() {
  const vis = (el) => !!el && el.getClientRects().length > 0;
  const caixa = [...document.querySelectorAll('footer div[contenteditable="true"], div[contenteditable="true"][data-tab="10"]')].find(vis);
  const dialogos = [...document.querySelectorAll('[role="dialog"], [data-animate-modal-popup="true"], [data-animate-modal-body="true"]')].filter(vis);
  const textoDialogo = dialogos.map((d) => d.innerText).join(' ');
  return {
    url: location.href,
    logado: !!document.querySelector('#pane-side, #side, [data-testid="chat-list"]'),
    qr: !!document.querySelector('canvas[aria-label*="scan" i], canvas[aria-label*="QR" i], div[data-ref] canvas, [data-testid="qrcode"]'),
    composer: !!caixa,
    invalido: /inv[aá]lido|invalid|n[aã]o est[aá] no whatsapp|isn.t on whatsapp|not on whatsapp/i.test(textoDialogo) ? textoDialogo.replace(/\s+/g, ' ').trim().slice(0, 200) : '',
    saida: document.querySelectorAll('.message-out').length,
  };
}

async function waEnviar(texto) {
  const vis = (el) => !!el && el.getClientRects().length > 0;
  const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
  const caixa = [...document.querySelectorAll('footer div[contenteditable="true"], div[contenteditable="true"][data-tab="10"]')].find(vis);
  if (!caixa) return { ok: false, motivo: 'caixa de mensagem não encontrada' };
  const antes = document.querySelectorAll('.message-out').length;
  caixa.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  document.execCommand('insertText', false, texto);
  await dorme(350);
  if (!(caixa.innerText || '').trim()) {
    // editor não aceitou o insertText: cola como se fosse Ctrl+V
    const dt = new DataTransfer();
    dt.setData('text/plain', texto);
    caixa.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await dorme(350);
  }
  const botao = [...document.querySelectorAll('button[aria-label="Enviar"], button[aria-label="Send"], [data-icon="send"], [data-icon="wds-ic-send-filled"]')]
    .map((el) => el.closest('button') || el).find(vis);
  if (botao) botao.click();
  else caixa.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  for (let i = 0; i < 30; i++) {
    await dorme(200);
    if (document.querySelectorAll('.message-out').length > antes) return { ok: true };
    // se o WhatsApp mudar o nome interno das mensagens: caixa esvaziou depois do clique = enviou
    if (i >= 5 && !(caixa.innerText || '').trim()) return { ok: true };
  }
  return { ok: false, motivo: 'a mensagem não apareceu na conversa' };
}
