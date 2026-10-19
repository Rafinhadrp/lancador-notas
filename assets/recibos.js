// Aba "Recibos": foto do contrato -> nome, telefone e modelo -> mensagens de "recibo pronto" que a
// extensão do Chrome envia pelo WhatsApp Web, uma de cada vez.
(function () {
  const $ = (s) => document.querySelector(s);
  const { ICONES, esc } = App;

  const PADRAO = {
    inicio: '{saudacao}, {nome}. Tudo bem?\nMeu nome é {atendente}, da Autoforte Veículos.\nFicou pronta a documentação do {modelo} para você realizar a transferência.',
    terceiro: 'Pode passar na loja para retirar o recibo.',
    loja: 'Você pretende realizar a transferência de forma digital ou presencial?',
  };
  const ler = (k, padrao) => { try { return localStorage.getItem(k) ?? padrao; } catch (_) { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* sem armazenamento */ } };

  let textos = JSON.parse(ler('recibos.textos', 'null') || 'null') || { ...PADRAO };
  let tipo = ler('recibos.tipo', 'terceiro');
  let itens = [];   // {id, thumb, estado:'lendo'|'pronta'|'falhou', tipo, nome, telefone, modelo, alerta, erro, repetido}
  let seq = 0, visivel = false, timer = null;

  const saudacao = (d = new Date()) => (d.getHours() < 12 ? 'Bom dia' : d.getHours() < 18 ? 'Boa tarde' : 'Boa noite');
  const atendente = () => String((App.perfil && App.perfil.nome) || '').trim().split(/\s+/)[0] || '';
  const linhas = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);

  // mensagens já com nome/modelo/atendente; {saudacao} fica para a hora do envio (Bom dia/Boa tarde/Boa noite)
  function mensagens(it) {
    const troca = (m) => m.replace(/\{nome\}/g, it.nome.trim()).replace(/\{modelo\}/g, it.modelo.trim()).replace(/\{atendente\}/g, atendente());
    return [...linhas(textos.inicio), ...linhas(it.tipo === 'loja' ? textos.loja : textos.terceiro)].map(troca);
  }

  const telefoneValido = (t) => /^55\d{10,11}$/.test(t);
  function normalizarTelefone(t) {
    let d = String(t || '').replace(/\D/g, '').replace(/^0+/, '');
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    return d.length === 10 || d.length === 11 ? '55' + d : String(t || '').replace(/\D/g, '');
  }
  const mostrarTelefone = (t) => {
    const d = String(t || '').replace(/^55/, '');
    return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t;
  };

  // ------------------------------------------------------------ pilha (loja / terceiro)
  function mostrarTipo() {
    document.querySelectorAll('[data-tipo-recibo]').forEach((b) => b.classList.toggle('ativa', b.dataset.tipoRecibo === tipo));
    $('#dicaTipo').textContent = tipo === 'loja'
      ? 'Pilha EM NOME DA LOJA: a última mensagem pergunta se a transferência vai ser digital ou presencial.'
      : 'Pilha EM NOME DE TERCEIRO: a última mensagem pede para passar na loja e retirar o recibo.';
  }
  document.querySelectorAll('[data-tipo-recibo]').forEach((b) => {
    b.onclick = () => { tipo = b.dataset.tipoRecibo; gravar('recibos.tipo', tipo); mostrarTipo(); };
  });

  // ------------------------------------------------------------ fotos
  $('#inputCameraContrato').onchange = (e) => { receber([...e.target.files]); e.target.value = ''; };
  $('#inputGaleriaContrato').onchange = (e) => { receber([...e.target.files]); e.target.value = ''; };

  async function receber(arquivos) {
    if (!arquivos.length) return;
    const novos = arquivos.map((f) => ({ id: ++seq, arquivo: f, estado: 'lendo', tipo, nome: '', telefone: '', modelo: '', thumb: '' }));
    itens.push(...novos);
    render();
    const fila = [...novos];
    await Promise.all(Array.from({ length: Math.min(3, fila.length) }, async () => {
      while (fila.length) await lerFoto(fila.shift());
    }));
  }

  async function lerFoto(it) {
    try {
      const img = await carregarImagem(it.arquivo);
      it.thumb = reduzir(img, 220, 0.7);
      render();
      const d = await App.api('/api/ler-contrato', { imagem: reduzir(img, 1800, 0.85).split(',')[1] });
      Object.assign(it, { nome: d.primeiro_nome || d.nome || '', nomeCompleto: d.nome || '', telefone: d.telefone || '',
        telefones: d.telefones || [], modelo: d.modelo || '', alerta: d.alerta || '', estado: 'pronta' });
      verificarRepetido(it);
    } catch (e) {
      it.estado = 'falhou';
      it.erro = e.message;
    }
    delete it.arquivo;
    render();
  }

  function carregarImagem(arquivo) {
    return new Promise((ok, falha) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => falha(new Error('Não consegui abrir essa imagem.'));
      img.src = url;
    });
  }
  function reduzir(img, max, qualidade) {
    const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * escala);
    c.height = Math.round(img.naturalHeight * escala);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', qualidade);
  }

  // mesmo telefone avisado nos últimos 30 dias?
  async function verificarRepetido(it) {
    if (!telefoneValido(it.telefone)) return;
    const desde = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data } = await App.sb.from('avisos').select('id, status, criado_em, modelo')
      .eq('telefone', it.telefone).neq('status', 'cancelada').gte('criado_em', desde).limit(1);
    it.repetido = data && data.length ? data[0] : null;
    if (it.repetido) render();
  }

  // ------------------------------------------------------------ cartões
  const problemas = (it) => [!it.nome.trim() && 'nome', !telefoneValido(it.telefone) && 'telefone', !it.modelo.trim() && 'modelo'].filter(Boolean);

  function render() {
    const lista = $('#listaRecibos');
    lista.innerHTML = itens.map(cartao).join('');
    lista.querySelectorAll('[data-campo]').forEach((el) => {
      el.addEventListener('input', () => {
        const it = itens.find((x) => x.id === +el.dataset.id);
        it[el.dataset.campo] = el.dataset.campo === 'telefone' ? el.value.replace(/\D/g, '') : el.value;
        atualizarPrevia(it);
      });
      el.addEventListener('blur', () => {
        const it = itens.find((x) => x.id === +el.dataset.id);
        if (el.dataset.campo === 'telefone') { it.telefone = normalizarTelefone(el.value); el.value = mostrarTelefone(it.telefone); verificarRepetido(it); }
        el.classList.toggle('erro', problemas(it).includes(el.dataset.campo));
        atualizarPrevia(it);
      });
    });
    lista.querySelectorAll('[data-tel-opcao]').forEach((b) => {
      b.onclick = () => { const it = itens.find((x) => x.id === +b.dataset.id); it.telefone = b.dataset.telOpcao; verificarRepetido(it); render(); };
    });
    lista.querySelectorAll('[data-trocar-tipo]').forEach((b) => {
      b.onclick = () => { const it = itens.find((x) => x.id === +b.dataset.trocarTipo); it.tipo = it.tipo === 'loja' ? 'terceiro' : 'loja'; render(); };
    });
    lista.querySelectorAll('[data-remover]').forEach((b) => {
      b.onclick = () => { itens = itens.filter((x) => x.id !== +b.dataset.remover); render(); };
    });
    atualizarBarra();
  }

  function previa(it) {
    const s = saudacao();
    return mensagens(it).map((m) => `<div class="balao">${esc(m.replace(/\{saudacao\}/g, s))}</div>`).join('');
  }
  function atualizarPrevia(it) {
    const el = document.getElementById('pr' + it.id);
    if (el) el.innerHTML = previa(it);
  }

  function cartao(it) {
    const thumb = it.thumb ? `<img class="miniatura" src="${it.thumb}" alt="">` : '<div class="miniatura"></div>';
    const remover = `<button class="icone-btn" data-remover="${it.id}" title="Remover">${ICONES.fechar}</button>`;
    if (it.estado === 'lendo') {
      return `<article class="cartao nota"><div class="nota-topo">${thumb}
        <div class="info"><b>Lendo o contrato…</b><span>Procurando cliente, telefone e carro</span></div></div>
        <div class="esqueleto"><div class="barra" style="width:40%"></div><div class="barra"></div></div></article>`;
    }
    if (it.estado === 'falhou') {
      return `<article class="cartao nota"><div class="nota-topo">${thumb}
        <div class="info"><b>Não consegui ler</b><span>${esc(it.erro)}</span></div>${remover}</div>
        <div class="nota-corpo"><div class="aviso erro">${ICONES.alerta}<span>Tire a foto de novo com o contrato inteiro e bem iluminado.</span></div></div></article>`;
    }
    const p = problemas(it);
    const avisos = [];
    if (it.alerta) avisos.push(`<div class="aviso warn">${ICONES.alerta}<span>${esc(it.alerta)}</span></div>`);
    if (it.repetido) avisos.push(`<div class="aviso warn">${ICONES.alerta}<span>Esse telefone já recebeu aviso (${esc(it.repetido.modelo)}, ${esc(App.quando(it.repetido.criado_em))}).</span></div>`);
    const outros = (it.telefones || []).filter((t) => t !== it.telefone);
    const opcoes = outros.length ? `<div class="opcoes-tel">Outro número no contrato: ${outros.map((t) => `<button class="btn pequeno" data-id="${it.id}" data-tel-opcao="${t}">${esc(mostrarTelefone(t))}</button>`).join(' ')}</div>` : '';
    return `<article class="cartao nota" id="r${it.id}">
      <div class="nota-topo">${thumb}
        <div class="info"><b>${esc(it.nomeCompleto || 'Confira o cliente')}</b>
          <span><button class="tag-tipo ${it.tipo}" data-trocar-tipo="${it.id}" title="Trocar">${it.tipo === 'loja' ? 'Em nome da loja' : 'Em nome de terceiro'}</button></span></div>${remover}</div>
      <div class="nota-corpo">
        <div class="grade-2">
          <label class="campo"><span>Nome (na saudação)</span>
            <input class="entrada${p.includes('nome') ? ' erro' : ''}" data-id="${it.id}" data-campo="nome" value="${esc(it.nome)}"></label>
          <label class="campo"><span>Modelo</span>
            <input class="entrada${p.includes('modelo') ? ' erro' : ''}" data-id="${it.id}" data-campo="modelo" value="${esc(it.modelo)}"></label>
        </div>
        <label class="campo" style="margin-top:10px"><span>WhatsApp do cliente</span>
          <input class="entrada valor${p.includes('telefone') ? ' erro' : ''}" data-id="${it.id}" data-campo="telefone" value="${esc(mostrarTelefone(it.telefone))}" inputmode="tel" placeholder="(16) 99999-9999"></label>
        ${opcoes}
        <div class="previa" id="pr${it.id}">${previa(it)}</div>
        ${avisos.join('')}
      </div></article>`;
  }

  function atualizarBarra() {
    const prontos = itens.filter((x) => x.estado === 'pronta').length;
    const lendo = itens.some((x) => x.estado === 'lendo');
    $('#barraRecibos').classList.toggle('hidden', !(visivel && prontos > 0));
    const b = $('#btnEnviarRecibos');
    b.disabled = lendo;
    b.innerHTML = lendo ? '<span class="gira"></span>Aguarde a leitura…'
      : `${ICONES.enviar}Enviar ${prontos === 1 ? '1 aviso' : prontos + ' avisos'} pelo WhatsApp`;
  }

  // ------------------------------------------------------------ envio (vai para a fila; a extensão manda)
  $('#btnEnviarRecibos').onclick = async () => {
    const prontos = itens.filter((x) => x.estado === 'pronta');
    const ruim = prontos.find((x) => problemas(x).length);
    if (ruim) {
      render();
      App.toast('Confira os campos em vermelho (nome, modelo e WhatsApp com DDD).', 'erro');
      document.getElementById('r' + ruim.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const b = $('#btnEnviarRecibos');
    b.disabled = true; b.innerHTML = '<span class="gira"></span>Enviando…';
    const { error } = await App.sb.from('avisos').insert(prontos.map((x) => ({
      tipo: x.tipo, nome: x.nome.trim(), telefone: x.telefone, modelo: x.modelo.trim(), mensagens: mensagens(x),
    })));
    if (error) {
      const semTabela = /avisos/.test(error.message) && /exist|schema cache|find the table/i.test(error.message);
      App.toast(semTabela ? 'O banco ainda não tem a tabela de avisos: rode o supabase/avisos.sql no Supabase.' : 'Erro ao enviar: ' + error.message, 'erro');
      atualizarBarra();
      return;
    }
    itens = itens.filter((x) => x.estado !== 'pronta');
    render();
    App.toast(`${prontos.length === 1 ? 'Aviso na fila' : prontos.length + ' avisos na fila'}. A extensão do Chrome envia pelo WhatsApp.`, 'ok');
    carregarHistorico();
  };

  // ------------------------------------------------------------ textos das mensagens
  function abrirTextos() {
    $('#txInicio').value = textos.inicio;
    $('#txTerceiro').value = textos.terceiro;
    $('#txLoja').value = textos.loja;
  }
  $('#btnSalvarTextos').onclick = () => {
    textos = { inicio: $('#txInicio').value, terceiro: $('#txTerceiro').value, loja: $('#txLoja').value };
    gravar('recibos.textos', JSON.stringify(textos));
    render();
    App.toast('Textos salvos neste aparelho.', 'ok');
  };
  $('#btnPadraoTextos').onclick = () => { textos = { ...PADRAO }; gravar('recibos.textos', JSON.stringify(textos)); abrirTextos(); render(); };

  // ------------------------------------------------------------ histórico
  const STATUS = { pendente: 'Na fila', enviando: 'Enviando…', enviado: 'Enviado', erro: 'Precisa de atenção', cancelada: 'Cancelado' };
  const CLASSE = { pendente: 'pendente', enviando: 'consultando', enviado: 'pronta', erro: 'erro', cancelada: 'cancelada' };
  async function carregarHistorico() {
    if (!App.perfil) return;
    const { data, error } = await App.sb.from('avisos').select('*')
      .eq('user_id', App.perfil.id).order('id', { ascending: false }).limit(60);
    const el = $('#historicoRecibos');
    if (error) {
      el.innerHTML = `<div class="vazio">${ICONES.alerta}<div>${/exist|schema cache|find the table/i.test(error.message) ? 'O banco ainda não tem a tabela de avisos: rode o supabase/avisos.sql no Supabase.' : esc(error.message)}</div></div>`;
      return;
    }
    const hoje = new Date().toDateString();
    $('#avFila').textContent = data.filter((a) => a.status === 'pendente' || a.status === 'enviando').length;
    $('#avEnviados').textContent = data.filter((a) => a.status === 'enviado' && new Date(a.enviado_em || a.criado_em).toDateString() === hoje).length;
    $('#avErros').textContent = data.filter((a) => a.status === 'erro').length;
    if (!data.length) { el.innerHTML = `<div class="vazio">${ICONES.vazio}<div>Nenhum aviso ainda.</div></div>`; return; }
    el.innerHTML = data.map((a) => {
      let acoes = '';
      if (a.status === 'pendente') acoes = `<button class="btn fantasma pequeno" data-cancelar-av="${a.id}">Cancelar</button>`;
      if (a.status === 'erro' || a.status === 'cancelada') acoes = `<button class="btn pequeno" data-reenviar-av="${a.id}">${ICONES.recarregar}Reenviar</button>`;
      return `<div class="item"><div class="corpo">
        <div class="linha1"><b>${esc(a.nome)}</b><span class="status ${CLASSE[a.status] || ''}">${STATUS[a.status] || a.status}</span>
          <span class="site-tag">${a.tipo === 'loja' ? 'Loja' : 'Terceiro'}</span></div>
        <div class="desc">${esc(a.modelo)} · ${esc(mostrarTelefone(a.telefone))}</div>
        ${a.mensagem ? `<div class="aviso ${a.status === 'erro' ? 'erro' : 'info'}" style="margin-top:8px">${ICONES.info}<span>${esc(a.mensagem)}</span></div>` : ''}
        <div class="meta"><span>${esc(App.quando(a.criado_em))}</span>${a.enviado_em ? `<span>· enviado ${esc(App.quando(a.enviado_em))}</span>` : ''}<span style="flex:1"></span>${acoes}</div>
      </div></div>`;
    }).join('');
    el.querySelectorAll('[data-cancelar-av]').forEach((b) => b.onclick = () => mudar(+b.dataset.cancelarAv, { status: 'cancelada' }, 'pendente'));
    el.querySelectorAll('[data-reenviar-av]').forEach((b) => b.onclick = () => mudar(+b.dataset.reenviarAv, { status: 'pendente', mensagem: '' }));
  }
  async function mudar(id, campos, somenteSe) {
    let q = App.sb.from('avisos').update(campos).eq('id', id);
    if (somenteSe) q = q.eq('status', somenteSe);
    const { error } = await q;
    if (error) App.toast(error.message, 'erro');
    else App.toast(campos.status === 'pendente' ? 'Aviso de volta na fila.' : 'Aviso cancelado.', 'ok');
    carregarHistorico();
  }

  mostrarTipo();
  abrirTextos();
  window.Recibos = {
    mostrar(sim) {
      visivel = sim;
      atualizarBarra();
      clearInterval(timer);
      if (sim) {
        render();
        carregarHistorico();
        timer = setInterval(() => { if (!document.hidden) carregarHistorico(); }, 4000);
      }
    },
  };
})();
