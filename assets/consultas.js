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
  $('#inputGaleriaRecibo').onchange = (e) => {
    const todos = [...e.target.files];
    const planilhas = todos.filter((f) => !/^image\//.test(f.type) && /\.(xlsx?|csv|txt|html?)$/i.test(f.name));
    receberFotos(todos.filter((f) => !planilhas.includes(f)));
    if (planilhas[0]) Fila.importar(planilhas[0]);
    e.target.value = '';
  };
  $('#inputPlanilha').onchange = (e) => { if (e.target.files[0]) Fila.importar(e.target.files[0]); e.target.value = ''; };
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
    const tag = (nome, st) => st === 'pulado' ? '' : `<span class="site-tag ${st}">${nome}${st === 'ok' ? ' ✓' : st === 'erro' ? ' ✕' : ''}</span>`;
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
    el.querySelectorAll('[data-reenviar]').forEach((b) => b.onclick = () => {
      const c = data.find((x) => x.id === +b.dataset.reenviar);
      const limpo = (st) => (st === 'pulado' ? 'pulado' : '');
      mudar(c.id, { status: 'pendente', mensagem: '', detran_status: limpo(c.detran_status), ipva_status: limpo(c.ipva_status), concluido_em: null });
    });
  }

  async function mudar(id, campos, somenteSe) {
    let q = App.sb.from('consultas').update(campos).eq('id', id);
    if (somenteSe) q = q.eq('status', somenteSe);
    const { error } = await q;
    if (error) App.toast(error.message, 'erro');
    else App.toast(campos.status === 'pendente' ? 'Consulta de volta na fila.' : 'Consulta cancelada.', 'ok');
    carregarHistorico();
  }


  // ------------------------------------------------------------ fila do IPVA, passo a passo (planilha do Autos 360)
  // As placas ficam na fila do aparelho; cada clique manda UMA consulta "só IPVA" para a extensão.
  // A pessoa imprime e só então clica na próxima.
  const SEM_PULADO = 'O banco ainda não aceita consulta "só IPVA": o administrador precisa rodar o supabase/schema.sql atualizado no Supabase.';
  const Fila = {
    dados: null,   // { itens:[{placa, renavam, cid, status, msg}], atual, final }
    timer: null,

    carregar() {
      try { this.dados = JSON.parse(localStorage.getItem('filaIpva') || 'null'); } catch (_) { this.dados = null; }
      this.render();
      this.acompanhar();
    },
    salvar() { try { localStorage.setItem('filaIpva', JSON.stringify(this.dados)); } catch (_) { /* sem espaço */ } },

    async importar(arquivo) {
      let linhas;
      try { linhas = await Planilha.ler(arquivo); } catch (e) { App.toast(`Não consegui ler a planilha: ${e.message}`, 'erro'); return; }
      const veiculos = lerVeiculos(linhas);
      if (!veiculos.length) { App.toast('Não achei placas e Renavams nessa planilha.', 'erro'); return; }
      if (this.dados && this.restantes().length && !confirm('Já tem uma fila em andamento. Trocar pela planilha nova?')) return;
      this.dados = { itens: veiculos.map((v) => ({ ...v, cid: null, status: '', msg: '' })), atual: 0, final: '' };
      this.dados.atual = this.proximo(-1);
      this.salvar();
      this.render();
      marcarRepetidas(this.dados.itens).then(() => this.render());
      $('#filaIpva').scrollIntoView({ behavior: 'smooth', block: 'start' });
      App.toast(`${veiculos.length} veículos na fila do IPVA.`, 'ok');
    },

    visiveis() { const f = this.dados.final; return this.dados.itens.map((it, i) => ({ it, i })).filter(({ it }) => !f || it.placa.endsWith(f)); },
    restantes() { return this.dados ? this.visiveis().filter(({ it }) => !it.cid && App.renavamValido(it.renavam)) : []; },
    proximo(depois) {
      const r = this.restantes().find(({ i }) => i > depois) || this.restantes()[0];
      return r ? r.i : -1;
    },

    async consultar(i) {
      const it = this.dados.itens[i];
      if (!it || !App.renavamValido(it.renavam)) return;
      this.dados.atual = i;
      const { data, error } = await App.sb.from('consultas')
        .insert({ placa: it.placa, renavam: it.renavam, detran_status: 'pulado' }).select('id').single();
      if (error) {
        App.toast(/check constraint|detran_status/i.test(error.message) ? SEM_PULADO : 'Erro ao enviar: ' + msgErro(error), 'erro');
        return;
      }
      Object.assign(it, { cid: data.id, status: 'pendente', msg: '' });
      this.salvar();
      this.render();
      this.acompanhar();
      carregarHistorico();
    },

    // acompanha a consulta da vez até ficar pronta (ou com erro)
    acompanhar() {
      clearInterval(this.timer);
      const it = this.dados && this.dados.itens[this.dados.atual];
      if (!it || !it.cid || ['pronta', 'erro', 'cancelada'].includes(it.status)) return;
      this.timer = setInterval(async () => {
        if (document.hidden) return;
        const { data } = await App.sb.from('consultas').select('status, mensagem').eq('id', it.cid).maybeSingle();
        if (!data) return;
        const mudou = data.status !== it.status;
        it.status = data.status; it.msg = data.mensagem || '';
        if (mudou) { this.salvar(); this.render(); }
        if (['pronta', 'erro', 'cancelada'].includes(data.status)) {
          clearInterval(this.timer);
          if (data.status === 'pronta') App.toast(`${it.placa} pronta no IPVA. Imprima e vá para a próxima.`, 'ok');
        }
      }, 2000);
    },

    render() {
      const el = $('#filaIpva');
      if (!this.dados || !this.dados.itens.length) { el.innerHTML = ''; return; }
      const d = this.dados, vis = this.visiveis();
      const feitos = vis.filter(({ it }) => it.cid).length;
      const atual = d.itens[d.atual];
      const emAndamento = atual && atual.cid && !['pronta', 'erro', 'cancelada'].includes(atual.status);
      // a da vez: a atual se ainda não foi consultada (e está no filtro); senão a próxima da fila
      const naoFeita = atual && !atual.cid && App.renavamValido(atual.renavam) && (!d.final || atual.placa.endsWith(d.final));
      const prox = naoFeita ? d.atual : this.proximo(d.atual);
      const proxIt = prox >= 0 ? d.itens[prox] : null;

      let painel;
      if (atual && atual.cid) {
        const st = { pendente: 'Na fila da extensão…', consultando: 'Consultando no IPVA…', pronta: 'Pronta ✓ — o resultado está aberto na aba do IPVA para imprimir',
          erro: 'Precisa de atenção', cancelada: 'Cancelada' }[atual.status] || atual.status;
        painel = `<div class="fila-atual ${atual.status}">
            <div class="linha1"><span class="placa-tag grande">${esc(atual.placa)}</span><span class="faint">Renavam ${esc(atual.renavam)}</span></div>
            <div class="fila-status">${emAndamento ? '<span class="gira"></span>' : ''}${esc(st)}</div>
            ${atual.msg ? `<div class="aviso ${atual.status === 'erro' ? 'erro' : 'info'}">${ICONES.info}<span>${esc(atual.msg)}</span></div>` : ''}
          </div>
          <div class="fila-botoes">
            ${proxIt ? `<button class="btn primario" data-fila="consultar" data-i="${prox}" ${emAndamento ? 'disabled' : ''}>${ICONES.enviar}Consultar a próxima: ${esc(proxIt.placa)}</button>`
              : `<div class="aviso info">${ICONES.info}<span>Acabou: todas as placas da fila foram consultadas.</span></div>`}
            ${!emAndamento && atual.status !== 'pronta' ? `<button class="btn" data-fila="refazer" data-i="${d.atual}">${ICONES.recarregar}Tentar de novo</button>` : ''}
          </div>`;
      } else if (proxIt) {
        painel = `<div class="fila-atual">
            <div class="linha1"><span class="placa-tag grande">${esc(proxIt.placa)}</span><span class="faint">Renavam ${esc(proxIt.renavam)}</span></div>
            <div class="fila-status">${feitos ? 'Próxima da fila.' : 'Primeira da fila.'} Deixe o painel da extensão aberto no Chrome do PC.</div>
          </div>
          <div class="fila-botoes"><button class="btn primario" data-fila="consultar" data-i="${prox}">${ICONES.enviar}Consultar ${esc(proxIt.placa)} no IPVA</button></div>`;
      } else {
        painel = `<div class="aviso info">${ICONES.info}<span>Nenhuma placa para consultar${d.final ? ` com final ${esc(d.final)}` : ''}.</span></div>`;
      }

      const chip = (it, i) => {
        const cls = !App.renavamValido(it.renavam) ? 'ruim' : it.status === 'pronta' ? 'ok' : it.status === 'erro' ? 'erro' : it.cid ? 'indo' : '';
        const titulo = !App.renavamValido(it.renavam) ? 'Renavam inválido' : it.repetida ? 'Já consultada hoje' : '';
        return `<button class="fila-chip ${cls}${i === d.atual ? ' atual' : ''}${it.repetida ? ' repetida' : ''}" data-fila="ir" data-i="${i}" title="${titulo}">${esc(it.placa)}</button>`;
      };
      el.innerHTML = `<section class="cartao fila-ipva">
        <div class="fila-topo">
          <div><h2>Fila do IPVA</h2><span class="faint">${feitos} de ${vis.length} consultadas${d.final ? ` · final ${esc(d.final)}` : ''}</span></div>
          <label class="fila-final"><span>Final da placa</span>
            <select class="entrada" data-fila-final>${['', ...'0123456789'].map((f) => `<option value="${f}" ${f === d.final ? 'selected' : ''}>${f || 'Todos'}</option>`).join('')}</select></label>
        </div>
        <div class="barra-progresso"><div style="width:${vis.length ? Math.round(feitos * 100 / vis.length) : 0}%"></div></div>
        ${painel}
        <div class="fila-chips">${vis.map(({ it, i }) => chip(it, i)).join('')}</div>
        <div class="fila-rodape"><span class="faint">Clique numa placa para consultar fora da ordem. Só IPVA (o Detran fica de fora).</span>
          <button class="btn fantasma pequeno" data-fila="limpar">Limpar fila</button></div>
      </section>`;

      el.querySelector('[data-fila-final]').onchange = (e) => {
        d.final = e.target.value;
        if (!emAndamento) d.atual = this.proximo(-1);
        this.salvar(); this.render();
      };
      el.querySelectorAll('[data-fila]').forEach((b) => b.onclick = () => {
        const i = +b.dataset.i, acao = b.dataset.fila;
        if (acao === 'consultar') this.consultar(i);
        else if (acao === 'refazer') { Object.assign(d.itens[i], { cid: null, status: '' }); this.consultar(i); }
        else if (acao === 'ir') {
          const it = d.itens[i];
          if (emAndamento) { App.toast('Espere a consulta atual terminar.', 'erro'); return; }
          if (!App.renavamValido(it.renavam)) { App.toast(`Renavam inválido em ${it.placa}: confira na planilha.`, 'erro'); return; }
          if (it.cid && !confirm(`Consultar ${it.placa} de novo?`)) return;
          Object.assign(it, { cid: null, status: '' });
          this.consultar(i);
        } else if (acao === 'limpar') {
          if (!confirm('Limpar a fila do IPVA? (as consultas já feitas continuam no histórico)')) return;
          clearInterval(this.timer); this.dados = null; this.salvar(); this.render();
        }
      });
    },
  };

  // linhas da planilha -> [{placa, renavam}] (colunas "PLACA" e "RENAVAM" pelo cabeçalho; senão procura em cada linha)
  function lerVeiculos(linhas) {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const cab = linhas.findIndex((l) => l.some((c) => norm(c).includes('PLACA')) && l.some((c) => norm(c).includes('RENAVAM')));
    let vs;
    if (cab >= 0) {
      const cp = linhas[cab].findIndex((c) => norm(c).includes('PLACA')), cr = linhas[cab].findIndex((c) => norm(c).includes('RENAVAM'));
      vs = linhas.slice(cab + 1).map((l) => ({
        placa: norm(l[cp]).replace(/[^A-Z0-9]/g, ''),
        renavam: String(l[cr] || '').replace(/\D/g, '') ? App.normalizarRenavam(String(l[cr]).replace(/\D/g, '')) : '',
      }));
    } else {
      vs = App.lerLista(linhas.map((l) => l.join(' ')).join('\n'));
    }
    const vistos = new Set();
    return vs.filter((v) => App.placaValida(v.placa) && !vistos.has(v.placa) && vistos.add(v.placa));
  }

  // placas já consultadas hoje (uma consulta só para a fila toda)
  async function marcarRepetidas(itens) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const { data } = await App.sb.from('consultas').select('placa').neq('status', 'cancelada')
      .gte('criado_em', hoje.toISOString()).in('placa', itens.map((x) => x.placa));
    const ja = new Set((data || []).map((x) => x.placa));
    itens.forEach((it) => { it.repetida = ja.has(it.placa); });
  }

  // ------------------------------------------------------------ visibilidade (chamado pelo index.html)
  window.Consultas = {
    mostrar(sim) {
      visivel = sim;
      atualizarBarra();
      clearInterval(timer);
      if (sim) {
        if (!Fila.dados) Fila.carregar();
        carregarHistorico();
        timer = setInterval(() => { if (!document.hidden) carregarHistorico(); }, 4000);
      }
    },
  };
})();
