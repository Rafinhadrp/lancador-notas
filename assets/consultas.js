// Aba "Consultas": foto do recibo (ou lista colada) -> placa + Renavam -> fila para o PC consultar no Detran e no IPVA.
(function () {
  const $ = (s) => document.querySelector(s);
  const { ICONES, esc } = App;

  let itens = [];   // em conferência: {id, thumb, foto, estado:'lendo'|'pronta'|'falhou', placa, renavam, alerta, erro, repetida}
  let seq = 0;
  let visivel = false;
  let timer = null;

  const SEM_TABELA = 'O banco ainda não tem a tabela de consultas: o administrador precisa rodar o supabase/schema.sql atualizado no Supabase.';
  const msgErro = (e) => (/consultas/.test(e.message || '') && /exist|schema cache|find the table/i.test(e.message || '')) ? SEM_TABELA : e.message;

  // ------------------------------------------------------------ entrada
  $('#inputCameraRecibo').onchange = (e) => { receberFotos([...e.target.files]); e.target.value = ''; };
  $('#inputGaleriaRecibo').onchange = (e) => { receberFotos([...e.target.files]); e.target.value = ''; };
  $('#btnColarLista').onclick = () => { $('#caixaLista').classList.toggle('hidden'); $('#textoLista').focus(); };
  $('#btnCancelarLista').onclick = () => { $('#caixaLista').classList.add('hidden'); };
  $('#btnAdicionarLista').onclick = () => {
    const lista = App.lerLista($('#textoLista').value);
    if (!lista.length) { App.toast('Não encontrei placa nem Renavam no texto.', 'erro'); return; }
    lista.forEach((v) => adicionar({ ...v, estado: 'pronta', alerta: '' }));
    $('#textoLista').value = '';
    $('#caixaLista').classList.add('hidden');
    render();
    App.toast(`${lista.length === 1 ? '1 veículo adicionado' : lista.length + ' veículos adicionados'}. Confira e envie.`, 'ok');
  };

  function adicionar(v) {
    const it = { id: ++seq, thumb: '', placa: '', renavam: '', alerta: '', ...v };
    itens.push(it);
    if (it.estado === 'pronta') verificarRepetida(it);
    return it;
  }

  async function receberFotos(arquivos) {
    if (!arquivos.length) return;
    const novos = arquivos.map((f) => adicionar({ arquivo: f, estado: 'lendo' }));
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
      it.foto = reduzir(img, 1600, 0.85);
      render();
      const r = await App.api('/api/ler-recibo', { imagem: it.foto.split(',')[1] });
      const vs = r.veiculos || [];
      if (!vs.length) throw new Error(r.alerta || 'Não encontrei placa nem Renavam nesta foto.');
      Object.assign(it, vs[0], { estado: 'pronta' });
      verificarRepetida(it);
      // foto com vários veículos (ex.: uma lista): um cartão para cada
      const pos = itens.indexOf(it);
      vs.slice(1).forEach((v, i) => {
        const novo = { id: ++seq, thumb: it.thumb, foto: it.foto, estado: 'pronta', ...v };
        itens.splice(pos + 1 + i, 0, novo);
        verificarRepetida(novo);
      });
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

  // mesma placa já consultada (ou na fila) hoje?
  async function verificarRepetida(it) {
    if (!App.placaValida(it.placa)) return;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const { data } = await App.sb.from('consultas').select('id, status, criado_em')
      .eq('placa', it.placa).neq('status', 'cancelada').gte('criado_em', hoje.toISOString()).limit(1);
    it.repetida = data && data.length ? data[0] : null;
    if (it.repetida) render();
  }

  // ------------------------------------------------------------ cartões
  function problemas(it) {
    const p = [];
    if (!App.placaValida(it.placa)) p.push('placa');
    if (!App.renavamValido(it.renavam)) p.push('renavam');
    return p;
  }

  function render() {
    const lista = $('#listaConsultas');
    lista.innerHTML = itens.map(cartao).join('');
    lista.querySelectorAll('[data-campo]').forEach((el) => {
      el.addEventListener('input', () => {
        const it = itens.find((x) => x.id === +el.dataset.id);
        let v = el.value;
        if (el.dataset.campo === 'placa') v = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
        else v = v.replace(/\D/g, '').slice(0, 11);
        if (el.value !== v) el.value = v;
        it[el.dataset.campo] = v;
        el.classList.toggle('erro', el.dataset.campo === 'placa' ? !App.placaValida(v) : !App.renavamValido(v));
      });
      el.addEventListener('blur', () => {
        const it = itens.find((x) => x.id === +el.dataset.id);
        if (el.dataset.campo === 'renavam') { it.renavam = el.value = App.normalizarRenavam(el.value); }
        el.classList.toggle('erro', problemas(it).includes(el.dataset.campo));
        if (el.dataset.campo === 'placa') verificarRepetida(it);
      });
    });
    lista.querySelectorAll('[data-remover]').forEach((b) => {
      b.onclick = () => { itens = itens.filter((x) => x.id !== +b.dataset.remover); render(); };
    });
    atualizarBarra();
  }

  function cartao(it) {
    const thumb = it.thumb ? `<img class="miniatura" src="${it.thumb}" alt="">`
      : `<div class="miniatura miniatura-xml">${it.estado === 'lendo' ? '' : 'LISTA'}</div>`;
    const remover = `<button class="icone-btn" data-remover="${it.id}" title="Remover">${ICONES.fechar}</button>`;
    if (it.estado === 'lendo') {
      return `<article class="cartao nota"><div class="nota-topo">${thumb}
        <div class="info"><b>Lendo o recibo…</b><span>Procurando placa e Renavam</span></div>${App.mascote('digitando', 'mini')}</div>
        <div class="esqueleto"><div class="barra" style="width:40%"></div><div class="barra"></div></div></article>`;
    }
    if (it.estado === 'falhou') {
      return `<article class="cartao nota"><div class="nota-topo">${thumb}
        <div class="info"><b>Não consegui ler</b><span>${esc(it.erro)}</span></div>${App.mascote('erro', 'mini')}${remover}</div>
        <div class="nota-corpo"><div class="aviso erro">${ICONES.alerta}<span>Tire a foto de novo mostrando a placa e o Renavam, ou use "Colar lista".</span></div></div></article>`;
    }
    const p = problemas(it);
    const avisos = [];
    if (it.alerta) avisos.push(`<div class="aviso warn">${ICONES.alerta}<span>${esc(it.alerta)}</span></div>`);
    if (it.repetida) avisos.push(`<div class="aviso warn">${ICONES.alerta}<span>Essa placa já foi enviada para consulta hoje (${esc(App.STATUS_CONSULTA[it.repetida.status] || it.repetida.status)}, ${esc(App.quando(it.repetida.criado_em))}).</span></div>`);
    return `<article class="cartao nota" id="c${it.id}">
      <div class="nota-topo">${thumb}
        <div class="info"><b>Confira o veículo</b><span>Consulta no Detran e no IPVA</span></div>${remover}</div>
      <div class="nota-corpo">
        <div class="grade-2">
          <label class="campo"><span>Placa</span>
            <input class="entrada placa${p.includes('placa') ? ' erro' : ''}" data-id="${it.id}" data-campo="placa" value="${esc(it.placa)}" placeholder="ABC1D23" autocapitalize="characters" spellcheck="false"></label>
          <label class="campo"><span>Renavam</span>
            <input class="entrada renavam${p.includes('renavam') ? ' erro' : ''}" data-id="${it.id}" data-campo="renavam" value="${esc(it.renavam)}" inputmode="numeric" placeholder="11 dígitos"></label>
        </div>
        ${avisos.join('')}
      </div></article>`;
  }

  function atualizarBarra() {
    const prontos = itens.filter((x) => x.estado === 'pronta').length;
    const lendo = itens.some((x) => x.estado === 'lendo');
    $('#barraConsultas').classList.toggle('hidden', !(visivel && prontos > 0));
    const b = $('#btnEnviarConsultas');
    b.disabled = lendo;
    b.innerHTML = lendo ? '<span class="gira"></span>Aguarde a leitura…'
      : `${ICONES.enviar}Consultar ${prontos === 1 ? '1 veículo' : prontos + ' veículos'}`;
  }

  // ------------------------------------------------------------ envio
  $('#btnEnviarConsultas').onclick = async () => {
    const prontos = itens.filter((x) => x.estado === 'pronta');
    const ruins = prontos.filter((x) => problemas(x).length);
    if (ruins.length) {
      render();
      App.toast('Confira os campos em vermelho (placa ABC1D23 e Renavam com 11 dígitos).', 'erro');
      document.getElementById('c' + ruins[0].id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const b = $('#btnEnviarConsultas');
    b.disabled = true; b.innerHTML = '<span class="gira"></span>Enviando…';
    const { error } = await App.sb.from('consultas').insert(prontos.map((x) => ({ placa: x.placa, renavam: x.renavam })));
    if (error) { App.toast('Erro ao enviar: ' + msgErro(error), 'erro'); atualizarBarra(); return; }
    itens = itens.filter((x) => x.estado !== 'pronta');
    render();
    App.toast(`${prontos.length === 1 ? 'Consulta enviada' : prontos.length + ' consultas enviadas'} para o PC.`, 'ok');
    carregarHistorico();
    $('#historicoConsultas').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ------------------------------------------------------------ histórico
  async function carregarHistorico() {
    if (!App.perfil) return;
    const { data, error } = await App.sb.from('consultas').select('*')
      .eq('user_id', App.perfil.id).order('id', { ascending: false }).limit(80);
    if (error) {
      $('#historicoConsultas').innerHTML = `<div class="vazio">${ICONES.alerta}<div>${esc(msgErro(error))}</div></div>`;
      return;
    }
    const hoje = new Date().toDateString();
    $('#cFila').textContent = data.filter((c) => c.status === 'pendente' || c.status === 'consultando').length;
    $('#cProntas').textContent = data.filter((c) => c.status === 'pronta' && new Date(c.concluido_em || c.criado_em).toDateString() === hoje).length;
    $('#cErros').textContent = data.filter((c) => c.status === 'erro').length;
    const el = $('#historicoConsultas');
    if (!data.length) { el.innerHTML = `<div class="vazio">${App.mascote('dormindo', 'grande')}<div>Nenhuma consulta ainda.</div></div>`; return; }
    const tag = (nome, st) => `<span class="site-tag ${st}">${nome}${st === 'ok' ? ' ✓' : st === 'erro' ? ' ✕' : ''}</span>`;
    el.innerHTML = data.map((c) => {
      let acoes = '';
      if (c.status === 'pendente') acoes = `<button class="btn fantasma pequeno" data-cancelar="${c.id}">Cancelar</button>`;
      if (c.status === 'erro' || c.status === 'cancelada' || c.status === 'pronta') acoes = `<button class="btn pequeno" data-reenviar="${c.id}">${ICONES.recarregar}${c.status === 'pronta' ? 'Consultar de novo' : 'Reenviar'}</button>`;
      return `<div class="item"><div class="corpo">
        <div class="linha1"><span class="placa-tag">${esc(c.placa)}</span>
          <span class="status ${c.status}">${App.STATUS_CONSULTA[c.status] || c.status}</span>
          ${tag('Detran', c.detran_status)} ${tag('IPVA', c.ipva_status)}</div>
        <div class="desc">Renavam ${esc(c.renavam)}</div>
        ${c.mensagem ? `<div class="aviso ${c.status === 'erro' ? 'erro' : 'info'}" style="margin-top:8px">${ICONES.info}<span>${esc(c.mensagem)}</span></div>` : ''}
        <div class="meta"><span>${esc(App.quando(c.criado_em))}</span>${c.concluido_em ? `<span>· pronta ${esc(App.quando(c.concluido_em))}</span>` : ''}<span style="flex:1"></span>${acoes}</div>
      </div></div>`;
    }).join('');
    el.querySelectorAll('[data-cancelar]').forEach((b) => b.onclick = () => mudar(+b.dataset.cancelar, { status: 'cancelada' }, 'pendente'));
    el.querySelectorAll('[data-reenviar]').forEach((b) => b.onclick = () => mudar(+b.dataset.reenviar,
      { status: 'pendente', mensagem: '', detran_status: '', ipva_status: '', concluido_em: null }));
  }

  async function mudar(id, campos, somenteSe) {
    let q = App.sb.from('consultas').update(campos).eq('id', id);
    if (somenteSe) q = q.eq('status', somenteSe);
    const { error } = await q;
    if (error) App.toast(error.message, 'erro');
    else App.toast(campos.status === 'pendente' ? 'Consulta de volta na fila.' : 'Consulta cancelada.', 'ok');
    carregarHistorico();
  }

  // ------------------------------------------------------------ visibilidade (chamado pelo index.html)
  window.Consultas = {
    mostrar(sim) {
      visivel = sim;
      atualizarBarra();
      clearInterval(timer);
      if (sim) {
        carregarHistorico();
        timer = setInterval(() => { if (!document.hidden) carregarHistorico(); }, 4000);
      }
    },
  };
})();
