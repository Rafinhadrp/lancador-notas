/* Funções compartilhadas entre o app do celular e o painel administrativo */
(function () {
  const ICONES = {
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.6"/></svg>',
    galeria: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="m20.5 15.5-4.8-4.8L6 20"/></svg>',
    enviar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h12M11 6l6 6-6 6"/><path d="M20 5v14"/></svg>',
    lista: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1.1" fill="currentColor"/><circle cx="4.8" cy="12" r="1.1" fill="currentColor"/><circle cx="4.8" cy="17.5" r="1.1" fill="currentColor"/></svg>',
    mais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    fechar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    sair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14"/><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15"/></svg>',
    escudo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z"/><path d="m9 12 2 2 4-4" stroke-linecap="round"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17v.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/></svg>',
    pc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M9 20h6M12 16v4"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg>',
    recarregar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/></svg>',
    vazio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h4"/></svg>',
  };

  const App = {
    ICONES,
    cfg: null,
    sb: null,
    perfil: null,
    sessao: null,

    async iniciar() {
      const r = await fetch('/api/config', { cache: 'no-store' });
      const cfg = await r.json();
      if (!r.ok) throw new Error(cfg.erro || 'Não consegui falar com a central.');
      App.cfg = cfg;
      App.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'lancador-notas-sessao' },
      });
      const { data } = await App.sb.auth.getSession();
      App.sessao = data.session;
      App.sb.auth.onAuthStateChange((_e, s) => { App.sessao = s; });
      if (App.sessao) await App.carregarPerfil();
      return cfg;
    },

    async carregarPerfil() {
      const { data, error } = await App.sb.from('perfis').select('*').eq('id', App.sessao.user.id).maybeSingle();
      if (error) throw error;
      if (!data || !data.ativo) { await App.sair(true); throw new Error('Usuário desativado. Fale com o administrador.'); }
      App.perfil = data;
      return data;
    },

    emailDe(usuario) {
      const u = String(usuario).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]/g, '');
      return `${u}@${App.cfg.dominio}`;
    },

    async entrar(usuario, senha) {
      const { data, error } = await App.sb.auth.signInWithPassword({ email: App.emailDe(usuario), password: senha });
      if (error) {
        if (/invalid/i.test(error.message)) throw new Error('Usuário ou senha incorretos.');
        if (/banned/i.test(error.message)) throw new Error('Usuário desativado. Fale com o administrador.');
        throw error;
      }
      App.sessao = data.session;
      return App.carregarPerfil();
    },

    async sair(silencioso) {
      try { await App.sb.auth.signOut(); } catch (_) { /* ignora */ }
      App.sessao = null; App.perfil = null;
      if (!silencioso) location.reload();
    },

    async token() {
      const { data } = await App.sb.auth.getSession();
      App.sessao = data.session;
      return data.session ? data.session.access_token : '';
    },

    async api(rota, corpo) {
      const r = await fetch(rota, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await App.token()}` },
        body: JSON.stringify(corpo || {}),
      });
      let dados = {};
      try { dados = await r.json(); } catch (_) { /* resposta vazia */ }
      if (!r.ok) throw new Error(dados.erro || `Erro ${r.status}`);
      return dados;
    },

    toast(msg, tipo) {
      let el = document.getElementById('toast');
      if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
      el.textContent = msg;
      el.className = `toast mostrar ${tipo || ''}`;
      clearTimeout(App._t);
      App._t = setTimeout(() => { el.className = 'toast'; }, tipo === 'erro' ? 5000 : 2800);
    },

    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    },

    // "1.842,61" -> 1842.61
    numero(valor) {
      const v = String(valor || '').replace(/[^\d,.-]/g, '');
      if (!v) return NaN;
      if (v.includes(',')) return parseFloat(v.replace(/\./g, '').replace(',', '.'));
      return parseFloat(v);
    },

    // 1842.61 -> "1.842,61"
    moeda(n) {
      return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    normalizarValor(v) {
      const n = App.numero(v);
      return Number.isFinite(n) ? App.moeda(n) : String(v || '').trim();
    },

    quando(iso) {
      if (!iso) return '';
      const d = new Date(iso), agora = new Date();
      const seg = (agora - d) / 1000;
      if (seg < 45) return 'agora';
      if (seg < 3600) return `há ${Math.round(seg / 60)} min`;
      const hoje = d.toDateString() === agora.toDateString();
      const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (hoje) return `hoje, ${hora}`;
      const ontem = new Date(agora); ontem.setDate(agora.getDate() - 1);
      if (d.toDateString() === ontem.toDateString()) return `ontem, ${hora}`;
      return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`;
    },

    // estado do programa do PC a partir do "batimento"
    estadoPC(agente) {
      if (!agente) return { classe: 'off', texto: 'PC sem o programa' };
      const seg = (Date.now() - new Date(agente.visto_em).getTime()) / 1000;
      if (seg > 25) return { classe: 'off', texto: 'PC desconectado' };
      if (agente.pausado) return { classe: 'warn', texto: 'PC pausado' };
      return { classe: 'ok', texto: 'PC conectado' };
    },

    // lê o XML da NF-e/NFC-e direto (sem IA) e devolve no mesmo formato do /api/ler
    lerNFe(texto) {
      const doc = new DOMParser().parseFromString(texto, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo XML inválido.');
      const tag = (nome, raiz = doc) => raiz.getElementsByTagName(nome)[0];
      const txt = (nome, raiz) => (tag(nome, raiz)?.textContent || '').trim();
      const inf = tag('infNFe');
      if (!inf) throw new Error('Esse XML não é de uma NF-e.');
      const limpar = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/\s+/g, ' ').trim().replace(/[-\s]+$/, '');

      const ide = tag('ide', inf), emit = tag('emit', inf), dest = tag('dest', inf);
      const dhEmi = txt('dhEmi', ide) || txt('dEmi', ide);
      const m = dhEmi.match(/^\d{4}-(\d{2})-(\d{2})/);
      const data = m ? `${m[2]}/${m[1]}` : '';
      const itens = [...inf.getElementsByTagName('det')].map((d) => limpar(txt('xProd', d))).filter(Boolean);
      const vNF = txt('vNF', tag('ICMSTot', inf)) || txt('vNF', inf);
      const valor = vNF ? App.moeda(parseFloat(vNF)) : '';

      // placa: procura nas observações da nota e dos itens (ABC1234 ou ABC1D23, com ou sem traço)
      const obs = [txt('infCpl', inf), txt('infAdFisco', inf), txt('xPed', inf),
        ...[...inf.getElementsByTagName('infAdProd')].map((e) => e.textContent),
        ...[...inf.getElementsByTagName('xTexto')].map((e) => e.textContent)].join(' ').toUpperCase();
      const p = obs.match(/(?:^|[^A-Z0-9])([A-Z]{3})[-\s]?(\d[A-Z0-9]\d{2})(?![A-Z0-9])/);
      const placa = p ? p[1] + p[2] : '';

      const cnpj = txt('CNPJ', emit).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      const alertas = [];
      const natOp = limpar(txt('natOp', ide));
      if (txt('finNFe', ide) === '4' || /DEVOLUC/.test(natOp)) alertas.push(`Nota de DEVOLUÇÃO (${natOp}): confira se deve mesmo ser lançada como despesa.`);
      const cStat = txt('cStat', tag('infProt') || doc);
      if (cStat && !['100', '150'].includes(cStat)) alertas.push(`Nota não autorizada na SEFAZ (situação ${cStat}).`);
      const cnpjDest = txt('CNPJ', dest);
      if (cnpjDest && cnpjDest !== '10696802000131') alertas.push(`Nota emitida para outro CNPJ (${limpar(txt('xNome', dest))}).`);
      if (!placa) alertas.push('Placa não encontrada no XML: digite a placa.');

      return {
        data, placa, itens,
        descricao: [data, itens.join(' + ')].filter(Boolean).join(' '),
        valor,
        fornecedor: limpar(txt('xNome', emit) || txt('xFant', emit)),
        cnpj_fornecedor: cnpj,
        alerta: alertas.join(' '),
        chave: (inf.getAttribute('Id') || '').replace(/^NFe/, ''),
      };
    },

    STATUS: {
      pendente: 'Na fila',
      lancando: 'Lançando…',
      lancada: 'Lançada',
      erro: 'Precisa de atenção',
      cancelada: 'Cancelada',
    },
  };

  window.App = App;
})();
