// Painel da extensão: login, fila de consultas e o trabalho nas abas do Detran e do IPVA.
// Fica aberto numa aba do Chrome normal da pessoa (onde o login do gov.br funciona).
// Nunca resolve captcha nem faz login: quando o site pede, avisa e espera a pessoa.
const $ = (s) => document.querySelector(s);
const VERSAO = chrome.runtime.getManifest().version;
const URL_VERSAO = 'https://github.com/Rafinhadrp/lancador-notas/releases/download/programa/versao.json';
const URL_ZIP = 'https://github.com/Rafinhadrp/lancador-notas/releases/download/programa/LancadorConsultas.zip';

class Login extends Error {}       // o site pediu login
class Fora extends Error {}        // o site não abriu (lento ou fora do ar)
class ErroSite extends Error {}    // o site respondeu com erro (Renavam não confere...)
class Parado extends Error {}      // Pausar / Pular

const estado = {
  rodando: false, pausado: false, pular: false,
  abas: {},                                    // site -> id da aba
  precisaLogin: { detran: false, ipva: false },
  foraAte: { detran: 0, ipva: 0 },
  ultimoTesteLogin: { detran: 0, ipva: 0 },
  ajustes: { pasta: 'Consultas Lançador', intervalo: 3, espera: 40, intervaloWhats: 20 },
  whatsLogin: false,          // WhatsApp Web pedindo o QR code: avisos pausados até a pessoa conectar
  ultimoTesteWhats: 0,
  avisosOff: 0,               // tabela de avisos ainda não criada: tenta de novo mais tarde
  atual: null,
};

// ------------------------------------------------------------------ relógio (não é freado com a aba em segundo plano)
const relogio = new Worker('relogio.js');
let seqRel = 0;
const esperas = new Map();
relogio.onmessage = (e) => { const f = esperas.get(e.data); esperas.delete(e.data); f && f(); };
const pausa = (ms) => new Promise((ok) => { const id = ++seqRel; esperas.set(id, ok); relogio.postMessage({ id, ms }); });
function checar() { if (estado.pausado || estado.pular) throw new Parado(); }
async function dormir(ms) { const fim = Date.now() + ms; while (Date.now() < fim) { checar(); await pausa(Math.min(250, fim - Date.now())); } }

// ------------------------------------------------------------------ tela
function log(msg) {
  const li = document.createElement('li');
  li.innerHTML = `<time>${new Date().toLocaleTimeString('pt-BR')}</time><span></span>`;
  li.lastChild.textContent = msg;
  const ul = $('#log');
  ul.prepend(li);
  while (ul.children.length > 300) ul.lastChild.remove();
}
function status(titulo, sub, cor = 'ok') {
  $('#stTitulo').textContent = titulo;
  $('#stSub').textContent = sub || '';
  // humor do mascote (no painel e no ícone do canto do Chrome)
  const humor = /^Pausado/.test(titulo) ? 'dormindo' : cor === 'erro' || /login|Conecte/i.test(titulo) ? 'erro'
    : cor === 'warn' ? 'digitando' : 'parado';
  Mascote.definir(humor);
  Mascote.selo({ alerta: humor === 'erro' });
  chrome.storage.local.set({ painelEstado: { titulo, sub: sub || '', estado: humor } });
}
function mostrarStatusLivre() {
  if (estado.whatsLogin) return status('Conecte o WhatsApp Web', 'Na aba do WhatsApp, leia o QR code com o celular. Os avisos continuam sozinhos depois.', 'warn');
  const logins = ORDEM.filter((s) => estado.precisaLogin[s]).map((s) => SITES[s].nome);
  if (logins.length) return status(`Faça login no ${logins.join(' e ')}`, `Entre com o gov.br na aba do ${logins.join(' e do ')} (ela foi aberta). As consultas continuam sozinhas depois.`, 'warn');
  if (estado.pausado) return status('Pausado', 'Clique em Continuar para voltar a consultar.', 'warn');
  status('Pronto', 'Esperando consultas e avisos do celular…', 'ok');
}
async function atualizarNumeros() {
  let total = 0;
  try {
    const n = await Central.contar();
    $('#nFila').textContent = n.fila;
    total += n.fila;
    $('#nProntas').textContent = n.prontas;
  } catch (_) { /* sem conexão: tenta depois */ }
  try {
    const a = await Central.contarAvisos();
    $('#nAvFila').textContent = a.fila;
    total += a.fila;
    $('#nAvEnviados').textContent = a.enviados;
  } catch (_) { /* tabela de avisos ainda não criada */ }
  Mascote.selo({ fila: total });
}
function bip() {
  try {
    const ctx = new AudioContext(), o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.value = 0.15;
    o.start(); o.stop(ctx.currentTime + 0.35);
  } catch (_) { /* sem som */ }
}

// ------------------------------------------------------------------ abas e páginas
async function exec(tabId, func, args = [], ms = 8000) {
  try {
    const r = await Promise.race([
      chrome.scripting.executeScript({ target: { tabId }, func, args }),
      new Promise((_, falha) => setTimeout(() => falha(new Error('tempo')), ms)),
    ]);
    return r && r[0] ? r[0].result : null;
  } catch (_) {
    return null;   // página no meio da navegação, aba fechada, etc.
  }
}

async function aba(site) {
  const id = estado.abas[site];
  if (id) {
    try { await chrome.tabs.get(id); return id; } catch (_) { /* fechada */ }
  }
  const atual = await chrome.tabs.getCurrent();
  const t = await chrome.tabs.create({ url: 'about:blank', active: false, windowId: atual ? atual.windowId : undefined });
  estado.abas[site] = t.id;
  return t.id;
}

async function fecharAba(site) {
  const id = estado.abas[site];
  delete estado.abas[site];
  if (id) await chrome.tabs.remove(id).catch(() => {});
}

async function trazer(site) {
  const id = estado.abas[site];
  if (!id) return;
  try {
    const t = await chrome.tabs.update(id, { active: true });
    await chrome.windows.update(t.windowId, { focused: true });
  } catch (_) { /* fechada */ }
}

// manda a aba para o endereço e espera começar a carregar
function navegar(tabId, url) {
  return new Promise((ok, falha) => {
    const fim = setTimeout(() => { limpar(); falha(new Fora()); }, 15000);
    const ouvir = (id, info) => { if (id === tabId && (info.status === 'loading' || info.url)) { limpar(); ok(); } };
    function limpar() { clearTimeout(fim); chrome.tabs.onUpdated.removeListener(ouvir); }
    chrome.tabs.onUpdated.addListener(ouvir);
    chrome.tabs.update(tabId, { url }).catch((e) => { limpar(); falha(new Fora(e.message)); });
  });
}

async function carregando(tabId) {
  try { return (await chrome.tabs.get(tabId)).status === 'loading'; } catch (_) { return true; }
}

const ehLogin = (info) => info && (info.login || LOGIN_URL.test(info.url || ''));

// abre a tela de consulta do site e deixa os campos prontos
async function abrirFormulario(site, esperaSeg = 30) {
  const cfg = SITES[site];
  const tabId = await aba(site);
  try { await navegar(tabId, cfg.url); } catch (e) { await fecharAba(site); throw new Fora(); }
  const fim = Date.now() + esperaSeg * 1000;
  let clicouAntes = false, info = null;
  while (Date.now() < fim) {
    checar();
    info = await exec(tabId, pgInspecionar, [cfg], 3000);
    if (info) {
      if (info.renavam) return tabId;
      if (cfg.antesTexto && !clicouAntes && info.antes) {
        await exec(tabId, pgClicarAntes, [cfg]);
        clicouAntes = true;
        await dormir(800);
        continue;
      }
      if (ehLogin(info)) throw new Login();
    }
    await dormir(400);
  }
  if (ehLogin(info)) throw new Login();
  if (!info || (await carregando(tabId))) { await fecharAba(site); throw new Fora(); }
  throw new Login('sem_formulario');
}

async function salvarPDF(tabId, nome) {
  const alvo = { tabId };
  let dados;
  try {
    await chrome.debugger.attach(alvo, '1.3');
    const r = await chrome.debugger.sendCommand(alvo, 'Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
    dados = r.data;
  } finally {
    await chrome.debugger.detach(alvo).catch(() => {});
  }
  const pasta = (estado.ajustes.pasta || 'Consultas Lançador').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  await chrome.downloads.download({
    url: 'data:application/pdf;base64,' + dados, filename: `${pasta}/${nome}.pdf`, conflictAction: 'uniquify', saveAs: false,
  });
  return `${pasta}/${nome}.pdf`;
}

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function consultarSite(site, placa, renavam) {
  const cfg = SITES[site];
  const tabId = await abrirFormulario(site);
  const r = await exec(tabId, pgPreencher, [cfg, placa, renavam]);
  if (!r || !r.renavam) throw new ErroSite('campo do Renavam não encontrado');
  if (!r.placa && cfg.placa.length) log(`   ${cfg.nome}: campo de placa não encontrado, seguindo só com o Renavam.`);
  checar();
  const antes = await exec(tabId, pgInspecionar, [cfg]);
  const urlForm = antes ? antes.url : '';
  if (!(await exec(tabId, pgClicarConsultar, [cfg]))) throw new ErroSite('botão Consultar não encontrado');

  const inicio = Date.now(), fim = inicio + estado.ajustes.espera * 1000;
  let estavel = 0, info = null;
  for (;;) {
    if (Date.now() > fim) {
      if (await carregando(tabId)) { await fecharAba(site); throw new Fora(); }
      throw new ErroSite((info && info.erro) || 'o site não mostrou o resultado a tempo');
    }
    await dormir(500);
    info = await exec(tabId, pgInspecionar, [cfg], 3000);
    if (!info) continue;   // navegando
    if (ehLogin(info)) throw new Login();
    if (info.erro && info.erro !== (antes && antes.erro)) throw new ErroSite(info.erro);
    if (cfg.resultado.length) { if (info.resultado) break; continue; }
    const mudou = info.url !== urlForm || !info.renavam;
    if (mudou && info.pronto) {
      estavel = estavel || Date.now();
      if (Date.now() - estavel > 1500) break;
    } else if (Date.now() - inicio > 3000 && info.pronto && antes && info.tamanho - antes.tamanho > 300) {
      await dormir(1000);   // resultado na mesma página, abaixo do formulário
      break;
    } else {
      estavel = 0;
    }
  }
  return salvarPDF(tabId, `${placa}_${cfg.nome.toUpperCase()}_${hoje()}`);
}

// ------------------------------------------------------------------ uma consulta inteira
async function processar(c, livres) {
  const r = {
    detran_status: c.detran_status || '', ipva_status: c.ipva_status || '',
    arquivos: (c.arquivos || '').split('\n').filter(Boolean),
    mensagens: (c.mensagem || '').split(' · ').filter((m) => ORDEM.some((s) => m.startsWith(SITES[s].nome + ':') && c[`${s}_status`] === 'erro')),
    login: [], fora: [],
  };
  for (const site of ORDEM) {
    const chave = `${site}_status`;
    if (r[chave] === 'ok' || r[chave] === 'erro' || r[chave] === 'pulado' || !livres.includes(site)) continue;   // erro só repete pelo "Reenviar"; pulado = não pedido
    const nome = SITES[site].nome;
    try {
      const arq = await consultarSite(site, c.placa, c.renavam);
      r[chave] = 'ok';
      r.arquivos.push(arq);
      log(`   ${nome}: ok → ${arq}`);
    } catch (e) {
      if (e instanceof Parado) throw e;
      if (e instanceof Login) {
        r.login.push(site);
        estado.precisaLogin[site] = true;
        log(e.message === 'sem_formulario'
          ? `   ${nome}: não achei os campos de placa/Renavam. Faça login na aba do ${nome}; se já estiver logado, o site pode ter mudado (mande o F12 para ajustar).`
          : `   ${nome}: o site pediu login.`);
      } else if (e instanceof Fora) {
        r.fora.push(site);
        estado.foraAte[site] = Date.now() + 120000;
        log(`   ${nome}: o site não abriu (lento ou fora do ar). Tento de novo em 2 minutos.`);
      } else {
        r[chave] = 'erro';
        r.mensagens.push(`${nome}: ${e.message}`);
        log(`   ${nome}: ${e.message}`);
      }
    }
    await dormir(500);
  }
  return r;
}

async function verificarLogins() {
  for (const site of ORDEM) {
    if (!estado.precisaLogin[site]) continue;
    const id = estado.abas[site];
    let t = null;
    try { t = id ? await chrome.tabs.get(id) : null; } catch (_) { t = null; }
    const dominio = new URL(SITES[site].url).hostname.split('.').slice(1).join('.');
    const naPagina = t && (t.url || '').includes(dominio) && !LOGIN_URL.test(t.url || '');
    const espera = naPagina ? 6000 : (t && t.active ? 1e12 : 30000);   // aba à vista no login: não mexe
    if (Date.now() - estado.ultimoTesteLogin[site] < espera) continue;
    estado.ultimoTesteLogin[site] = Date.now();
    try {
      await abrirFormulario(site, 10);
      estado.precisaLogin[site] = false;
      log(`✔ ${SITES[site].nome}: login feito, continuando as consultas.`);
    } catch (e) {
      if (e instanceof Parado) throw e;
    }
  }
}

async function cicloUma() {
  await verificarLogins();
  const livres = ORDEM.filter((s) => !estado.precisaLogin[s] && Date.now() >= estado.foraAte[s]);
  const c = await Central.proximaConsulta(livres);
  if (!c) return false;
  estado.atual = c;
  $('#btnPular').hidden = false;
  status(`Consultando ${c.placa}…`, `Renavam ${c.renavam}`, 'warn');
  log(`🔎 ${c.placa} · Renavam ${c.renavam}`);
  let r;
  try {
    r = await processar(c, livres);
  } catch (e) {
    estado.atual = null;
    $('#btnPular').hidden = true;
    if (e instanceof Parado && estado.pular) {
      estado.pular = false;
      await Central.atualizarConsulta(c.id, { status: 'erro', mensagem: 'Pulada no Chrome.' });
      log('↷ Consulta pulada.');
      return true;
    }
    if (e instanceof Parado) {
      await Central.atualizarConsulta(c.id, { status: 'pendente', mensagem: '' });
      log('■ Pausado. A consulta voltou para a fila.');
      return true;
    }
    await Central.atualizarConsulta(c.id, { status: 'erro', mensagem: `Erro na extensão: ${e.message}` });
    log(`✖ Erro: ${e.message}`);
    return true;
  }
  estado.atual = null;
  $('#btnPular').hidden = true;
  const campos = { detran_status: r.detran_status, ipva_status: r.ipva_status, arquivos: r.arquivos.join('\n'), mensagem: r.mensagens.join(' · ') };
  const faltam = ORDEM.filter((s) => r[`${s}_status`] === '');
  if (faltam.length) {
    const avisos = [];
    if (r.login.length) avisos.push('Esperando login no ' + r.login.map((s) => SITES[s].nome).join(' e '));
    if (r.fora.length) avisos.push(r.fora.map((s) => SITES[s].nome).join(' e ') + ' não abriu; tento de novo em instantes');
    const outros = faltam.filter((s) => !r.login.includes(s) && !r.fora.includes(s));
    if (outros.length) avisos.push('Falta consultar no ' + outros.map((s) => SITES[s].nome).join(' e '));
    campos.status = 'pendente';
    campos.mensagem = [...r.mensagens, ...avisos].join(' · ');
    if (r.login.length) {
      await trazer(r.login[0]);
      bip();
      chrome.notifications.create({ type: 'basic', iconUrl: 'icones/128.png', title: 'Lançador · Consultas',
        message: `Faça login no ${r.login.map((s) => SITES[s].nome).join(' e ')} (gov.br). As consultas continuam sozinhas depois.` });
    }
  } else if (r.detran_status === 'erro' || r.ipva_status === 'erro') {
    campos.status = 'erro';
    log(`⚠ ${c.placa}: ${campos.mensagem}`);
  } else {
    campos.status = 'pronta';
    log(`✔ ${c.placa}: consultas prontas.`);
    Mascote.definir('feliz', { temporario: true });
    // consulta de um site só (passo a passo pelo app): mostra o resultado para a pessoa imprimir
    const unico = ORDEM.filter((s) => r[`${s}_status`] !== 'pulado');
    if (unico.length === 1) await trazer(unico[0]).catch(() => {});
  }
  await Central.atualizarConsulta(c.id, campos);
  atualizarNumeros();
  mostrarStatusLivre();
  try { await dormir(estado.ajustes.intervalo * 1000); } catch (_) { /* pausado */ }
  return true;
}

// ------------------------------------------------------------------ avisos de recibo pelo WhatsApp Web
class SemWhats extends Error {}    // WhatsApp Web desconectado (QR code)

const saudacao = (d = new Date()) => (d.getHours() < 12 ? 'Bom dia' : d.getHours() < 18 ? 'Boa tarde' : 'Boa noite');
const sorteio = (min, max) => min + Math.random() * (max - min);

async function abaWhats(criar = true) {
  const id = estado.abas.whats;
  if (id) { try { await chrome.tabs.get(id); return id; } catch (_) { /* fechada */ } }
  let existente = null;
  try { [existente] = await chrome.tabs.query({ url: WHATS_URL + '/*' }); } catch (_) { /* endereço de teste */ }
  if (existente) { estado.abas.whats = existente.id; return existente.id; }
  if (!criar) return null;
  const atual = await chrome.tabs.getCurrent();
  const t = await chrome.tabs.create({ url: WHATS_URL, active: false, windowId: atual ? atual.windowId : undefined });
  estado.abas.whats = t.id;
  return t.id;
}

async function abrirConversa(telefone) {
  const tabId = await abaWhats();
  try { await navegar(tabId, `${WHATS_URL}/send?phone=${telefone}`); } catch (_) { throw new Fora(); }
  const fim = Date.now() + 60000;   // o WhatsApp Web demora para carregar
  let info = null;
  while (Date.now() < fim) {
    checar();
    await dormir(700);
    info = await exec(tabId, waInspecionar, [], 4000);
    if (!info) continue;
    if (info.invalido) throw new ErroSite('esse número não tem WhatsApp ou está errado');
    if (info.composer) return { tabId, info };
    if (info.qr && !info.logado) throw new SemWhats();
  }
  throw new Fora();
}

async function enviarAviso(av) {
  const { tabId } = await abrirConversa(av.telefone);
  const msgs = (av.mensagens || []).map((m) => String(m).replace(/\{saudacao\}/g, saudacao()));
  for (let i = 0; i < msgs.length; i++) {
    checar();
    const r = await exec(tabId, waEnviar, [msgs[i]], 15000);
    if (!r || !r.ok) throw new ErroSite(`parou na mensagem ${i + 1} de ${msgs.length}: ${(r && r.motivo) || 'o WhatsApp não respondeu'}`);
    await Central.atualizarAviso(av.id, { mensagem: `Enviadas ${i + 1} de ${msgs.length}` }).catch(() => {});
    if (i < msgs.length - 1) await dormir(sorteio(3000, 6000));   // como uma pessoa digitando
  }
}

async function cicloAviso() {
  if (Date.now() < estado.avisosOff) return false;
  if (estado.whatsLogin) {
    if (Date.now() - estado.ultimoTesteWhats < 6000) return false;
    estado.ultimoTesteWhats = Date.now();
    const id = await abaWhats(false);
    const info = id ? await exec(id, waInspecionar, [], 4000) : null;
    if (!info || !info.logado) return false;
    estado.whatsLogin = false;
    log('✔ WhatsApp Web conectado, continuando os avisos.');
  }
  let av;
  try { av = await Central.proximoAviso(); }
  catch (e) {
    if (/avisos/.test(e.message)) { estado.avisosOff = Date.now() + 600000; log('Avisos: o banco ainda não tem a tabela (rode o supabase/avisos.sql).'); return false; }
    throw e;
  }
  if (!av) return false;
  estado.atual = av;
  $('#btnPular').hidden = false;
  status(`Enviando aviso para ${av.nome}…`, `${av.modelo} · WhatsApp`, 'warn');
  log(`💬 ${av.nome} (${av.modelo}) · ${av.tipo === 'loja' ? 'em nome da loja' : 'em nome de terceiro'}`);
  try {
    await enviarAviso(av);
    await Central.atualizarAviso(av.id, { status: 'enviado', mensagem: '' });
    log(`✔ Aviso enviado para ${av.nome}.`);
    Mascote.definir('feliz', { temporario: true });
  } catch (e) {
    if (e instanceof Parado && estado.pular) {
      estado.pular = false;
      await Central.atualizarAviso(av.id, { status: 'erro', mensagem: 'Pulado no Chrome (confira no WhatsApp o que já foi).' });
      log('↷ Aviso pulado.');
    } else if (e instanceof Parado) {
      await Central.atualizarAviso(av.id, { status: 'erro', mensagem: 'Pausado no meio do envio. Confira no WhatsApp o que já foi e reenvie se precisar.' });
      log('■ Pausado.');
    } else if (e instanceof SemWhats) {
      estado.whatsLogin = true;
      await Central.atualizarAviso(av.id, { status: 'pendente', mensagem: 'Esperando conectar o WhatsApp Web' });
      log('   O WhatsApp Web pediu para ler o QR code.');
      const id = await abaWhats(false);
      if (id) { const t = await chrome.tabs.update(id, { active: true }); await chrome.windows.update(t.windowId, { focused: true }).catch(() => {}); }
      bip();
      chrome.notifications.create({ type: 'basic', iconUrl: 'icones/128.png', title: 'Lançador · Avisos', message: 'Conecte o WhatsApp Web (QR code). Os avisos continuam sozinhos depois.' });
    } else if (e instanceof Fora) {
      await Central.atualizarAviso(av.id, { status: 'pendente', mensagem: 'O WhatsApp Web não abriu; tento de novo em instantes' });
      log('   O WhatsApp Web não abriu. Tento de novo em instantes.');
      await pausa(30000);
    } else {
      await Central.atualizarAviso(av.id, { status: 'erro', mensagem: e.message });
      log(`✖ ${av.nome}: ${e.message}`);
    }
  }
  estado.atual = null;
  $('#btnPular').hidden = true;
  atualizarNumeros();
  mostrarStatusLivre();
  // intervalo entre um cliente e outro (variando um pouco, para não parecer robô)
  const base = Math.max(10, Number(estado.ajustes.intervaloWhats) || 20) * 1000;
  try { await dormir(sorteio(base * 0.8, base * 1.3)); } catch (_) { /* pausado */ }
  return true;
}

async function laco() {
  if (estado.rodando) return;
  estado.rodando = true;
  try { await Central.recuperarPresas(); } catch (_) { /* tenta depois */ }
  try { await Central.recuperarAvisos(); } catch (_) { /* tabela de avisos ainda não criada */ }
  let ultimoNumero = 0;
  while (estado.rodando) {
    try {
      if (Date.now() - ultimoNumero > 15000) { ultimoNumero = Date.now(); atualizarNumeros(); }
      if (estado.pausado) { mostrarStatusLivre(); await pausa(500); continue; }
      const fez = (await cicloAviso()) || (await cicloUma());
      if (!fez) { mostrarStatusLivre(); await pausa(3000); }
    } catch (e) {
      if (e instanceof Parado) { estado.pular = false; continue; }
      if (e.sessao) { await pedirLoginDeNovo(e.message); return; }
      status('Sem conexão', e.message, 'erro');
      log(`✖ ${e.message}`);
      await pausa(5000);
    }
  }
}

// sessão derrubada pelo Supabase: para tudo e volta para a tela de entrar (em vez de repetir o erro sem parar)
async function pedirLoginDeNovo(msg) {
  estado.rodando = false;
  log(`✖ ${msg}`);
  const central = Central.cfg ? Central.cfg.central : '';
  await Central.sair();
  status('Entre de novo', msg, 'erro');
  bip();
  chrome.notifications.create({ type: 'basic', iconUrl: 'icones/128.png', title: 'Lançador · Consultas', message: msg });
  $('#telaPrincipal').hidden = true;
  $('#telaLogin').hidden = false;
  $('#lgCentral').value = (central || 'lancador-notas-agente-three.vercel.app').replace(/^https?:\/\//, '');
  $('#erroLogin').textContent = msg;
  $('#lgUsuario').focus();
}

// ------------------------------------------------------------------ versão nova da extensão
async function verificarVersao() {
  try {
    const r = await fetch(URL_VERSAO, { cache: 'no-store' });
    const info = await r.json();
    const num = (v) => String(v || '0').split('.').map((x) => parseInt(x, 10) || 0);
    const cmp = (x, y) => { for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
    const maior = cmp(num(info.extensao), num(VERSAO)) > 0;
    if (info.extensao && maior) {
      $('#faixaVersao').hidden = false;
      $('#faixaVersao').innerHTML = `Nova versão ${info.extensao} da extensão. <a href="${URL_ZIP}">Baixar</a>, extrair por cima da pasta da extensão e clicar em ↻ em chrome://extensions.`;
    }
  } catch (_) { /* sem internet */ }
}

// ------------------------------------------------------------------ início
async function abrirPrincipal() {
  await Mascote.iniciar().catch(() => {});
  $('#telaLogin').hidden = true;
  $('#telaPrincipal').hidden = false;
  $('#quem').textContent = `${Central.cfg.nome || ''} · ${Central.cfg.central.replace(/^https?:\/\//, '')}`;
  const { ajustes } = await chrome.storage.local.get('ajustes');
  Object.assign(estado.ajustes, ajustes || {});
  $('#ajPasta').value = estado.ajustes.pasta;
  $('#ajIntervalo').value = estado.ajustes.intervalo;
  $('#ajIntervaloWhats').value = estado.ajustes.intervaloWhats;
  $('#ajEspera').value = estado.ajustes.espera;
  try { const t = await chrome.tabs.getCurrent(); if (t) await chrome.tabs.update(t.id, { autoDiscardable: false }); } catch (_) {}
  log(`Extensão ${VERSAO} pronta. Deixe esta aba aberta.`);
  mostrarStatusLivre();
  verificarVersao();
  laco();
}

$('#formLogin').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const b = $('#btnEntrar');
  b.disabled = true; b.textContent = 'Entrando…';
  $('#erroLogin').textContent = '';
  try {
    await Central.entrar($('#lgCentral').value, $('#lgUsuario').value, $('#lgSenha').value);
    await abrirPrincipal();
  } catch (e) {
    $('#erroLogin').textContent = e.message;
  } finally {
    b.disabled = false; b.textContent = 'Entrar';
  }
});

$('#btnPausar').onclick = () => {
  estado.pausado = !estado.pausado;
  $('#btnPausar').textContent = estado.pausado ? 'Continuar' : 'Pausar';
  log(estado.pausado ? 'Pausado.' : 'Continuando.');
  mostrarStatusLivre();
};
$('#btnPular').onclick = () => { estado.pular = true; };
$('#btnSair').onclick = async () => { estado.rodando = false; estado.pausado = true; await Central.sair(); location.reload(); };
$('#btnSalvarAj').onclick = async () => {
  estado.ajustes.pasta = $('#ajPasta').value.trim() || 'Consultas Lançador';
  estado.ajustes.intervalo = Math.max(1, Math.min(60, Number($('#ajIntervalo').value) || 3));
  estado.ajustes.intervaloWhats = Math.max(10, Math.min(300, Number($('#ajIntervaloWhats').value) || 20));
  estado.ajustes.espera = Math.max(15, Math.min(180, Number($('#ajEspera').value) || 40));
  await chrome.storage.local.set({ ajustes: estado.ajustes });
  $('#ajAviso').textContent = '✔ Salvo';
  setTimeout(() => { $('#ajAviso').textContent = ''; }, 2000);
};
$('#btnAbrirPasta').onclick = () => chrome.downloads.showDefaultFolder();
$('#versao').textContent = 'v' + VERSAO;

(async () => {
  try {
    const eu = await chrome.tabs.getCurrent();
    const outros = (await chrome.tabs.query({ url: chrome.runtime.getURL('painel.html') })).filter((t) => !eu || t.id !== eu.id);
    if (outros.length) {
      await chrome.tabs.update(outros[0].id, { active: true });
      await chrome.windows.update(outros[0].windowId, { focused: true }).catch(() => {});
      if (eu) chrome.tabs.remove(eu.id);
      return;
    }
  } catch (_) { /* segue */ }
  const { sitesTeste } = await chrome.storage.local.get('sitesTeste');   // só nos testes automáticos
  if (sitesTeste) for (const k of Object.keys(sitesTeste)) { if (k === 'whatsUrl') WHATS_URL = sitesTeste[k]; else Object.assign(SITES[k], sitesTeste[k]); }
  if (await Central.carregar()) {
    abrirPrincipal();
  } else {
    $('#telaLogin').hidden = false;
    $('#lgCentral').value = 'lancador-notas-agente-three.vercel.app';
  }
})();
