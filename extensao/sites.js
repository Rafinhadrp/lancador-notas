// Configuração dos sites e funções que rodam DENTRO das páginas do Detran/IPVA (via chrome.scripting).
// >>> SELETORES: tudo o que depende das páginas fica em SITES. Ainda provisórios (largos, por nome,
// id, placeholder e texto) até o Rafael mandar os elementos do F12. <<<
const CAMPO = (nome) => [`input[name*="${nome}" i]`, `input[id*="${nome}" i]`, `input[placeholder*="${nome}" i]`, `input[aria-label*="${nome}" i]`];

const SITES = {
  detran: {
    nome: 'Detran',
    url: 'https://www.detran.sp.gov.br/detransp/pb/servicos/veiculos/consultar_debitos_restricoes?id=consultar_debitos_restricoes',
    antesTexto: 've[ií]culos? de outras pessoas',   // botão "Consultar veículos de outras pessoas" (conta pessoal)
    placa: CAMPO('placa'),
    renavam: CAMPO('renavam'),
    consultar: ['input[type="submit"][value*="onsultar"]', 'button[type="submit"]'],
    consultarTexto: '^\\s*(consultar|pesquisar)\\s*$',
    resultado: [],   // vazio = descobre sozinho (formulário sumiu, endereço mudou ou a página cresceu)
    erro: ['[role="alert"]', '.alert-danger', '.br-message.danger', '.br-message.warning', '.mensagem-erro', '.text-danger', '.invalid-feedback', '.error-message'],
  },
  ipva: {
    nome: 'IPVA',
    url: 'https://www3.fazenda.sp.gov.br/SIVEI/DebitosVinculados/Consulta',
    antesTexto: '',
    placa: CAMPO('placa'),
    renavam: CAMPO('renavam'),
    consultar: ['input[type="submit"][value*="onsultar"]', 'button[type="submit"]', 'input[type="submit"]'],
    consultarTexto: '^\\s*(consultar|pesquisar)\\s*$',
    resultado: [],
    erro: ['[role="alert"]', '.alert-danger', '.validation-summary-errors', '.field-validation-error', '.text-danger', '.mensagem-erro', '.error-message'],
  },
};
const ORDEM = ['detran', 'ipva'];
const LOGIN_URL = /acesso\.gov\.br|sso\.|\/login|autenticacao|signin/i;

// ------------------------------------------------------------------ funções injetadas nas páginas
// (cada uma precisa ser independente: o Chrome copia só o corpo da função para dentro da página)

function pgInspecionar(cfg) {
  const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const achar = (lista) => { for (const s of lista || []) { for (const el of document.querySelectorAll(s)) if (vis(el)) return el; } return null; };
  const porTexto = (re) => {
    if (!re) return null;
    const r = new RegExp(re, 'i');
    for (const el of document.querySelectorAll('button, a, [role="tab"], [role="button"], input[type="button"], input[type="submit"], li, label, span')) {
      const t = (el.innerText || el.value || '').trim();
      if (t && t.length < 120 && r.test(t) && vis(el)) return el;
    }
    return null;
  };
  const erroEl = achar(cfg.erro);
  const login = !!(achar(['iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', '.g-recaptcha', '.h-captcha', 'input[type="password"]'])
    || porTexto('^\\s*entrar com\\s*gov\\.br'));
  return {
    url: location.href,
    pronto: document.readyState === 'complete',
    renavam: !!achar(cfg.renavam),
    placa: !!achar(cfg.placa),
    antes: !!porTexto(cfg.antesTexto),
    resultado: (cfg.resultado || []).length ? !!achar(cfg.resultado) : false,
    erro: erroEl ? erroEl.innerText.replace(/\s+/g, ' ').trim().slice(0, 300) : '',
    login,
    tamanho: (document.body && document.body.innerText || '').length,
  };
}

function pgClicarAntes(cfg) {
  const vis = (el) => !!el && el.getClientRects().length > 0;
  const r = new RegExp(cfg.antesTexto, 'i');
  for (const el of document.querySelectorAll('button, a, [role="tab"], [role="button"], input[type="button"], li, label, span')) {
    const t = (el.innerText || el.value || '').trim();
    if (t && t.length < 120 && r.test(t) && vis(el)) { el.click(); return true; }
  }
  return false;
}

function pgPreencher(cfg, placa, renavam) {
  const vis = (el) => !!el && el.getClientRects().length > 0;
  const achar = (lista) => { for (const s of lista || []) { for (const el of document.querySelectorAll(s)) if (vis(el)) return el; } return null; };
  // valor "de verdade" (funciona em React/Angular): setter nativo + eventos
  const por = (el, v) => {
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    el.blur();
  };
  const p = achar(cfg.placa), r = achar(cfg.renavam);
  if (p) por(p, placa);
  if (r) por(r, renavam);
  return { placa: !!p, renavam: !!r };
}

function pgClicarConsultar(cfg) {
  const vis = (el) => !!el && el.getClientRects().length > 0 && !el.disabled;
  if (cfg.consultarTexto) {
    const r = new RegExp(cfg.consultarTexto, 'i');
    for (const el of document.querySelectorAll('button, input[type="submit"], input[type="button"], a')) {
      const t = (el.innerText || el.value || '').trim();
      if (t && r.test(t) && vis(el)) { el.click(); return true; }
    }
  }
  for (const s of cfg.consultar || []) for (const el of document.querySelectorAll(s)) if (vis(el)) { el.click(); return true; }
  return false;
}
