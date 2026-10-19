// Conexão da extensão com a central (Vercel + Supabase): login, renovação do acesso e fila de consultas.
const Central = {
  cfg: null,      // {central, sbUrl, anon, dominio, refresh, access, expira, userId, nome}

  async carregar() {
    const { conta } = await chrome.storage.local.get('conta');
    Central.cfg = conta || null;
    return Central.cfg;
  },

  async guardar() {
    await chrome.storage.local.set({ conta: Central.cfg });
  },

  normalizarEndereco(e) {
    e = String(e || '').trim().replace(/\/+$/, '');
    if (e && !/^https?:\/\//.test(e)) e = 'https://' + e;
    return e;
  },

  async entrar(endereco, usuario, senha) {
    endereco = Central.normalizarEndereco(endereco);
    let r;
    try { r = await fetch(`${endereco}/api/config`, { cache: 'no-store' }); }
    catch (e) { throw new Error('Não consegui acessar a central. Confira o endereço e a internet.'); }
    const d = await r.json().catch(() => { throw new Error('Esse endereço não é da central do Lançador de Notas.'); });
    if (!r.ok) throw new Error(d.erro || `Erro ${r.status} na central.`);
    const u = String(usuario).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]/g, '');
    Central.cfg = { central: endereco, sbUrl: d.supabaseUrl, anon: d.anonKey, dominio: d.dominio };
    await Central._auth('password', { email: `${u}@${d.dominio}`, password: senha });
    const p = await Central.rest('GET', 'perfis', { id: `eq.${Central.cfg.userId}`, select: 'nome,ativo' });
    if (!p || !p[0] || !p[0].ativo) { Central.cfg = null; throw new Error('Usuário desativado. Fale com o administrador.'); }
    Central.cfg.nome = p[0].nome;
    await Central.guardar();
  },

  async sair() {
    Central.cfg = null;
    await chrome.storage.local.remove('conta');
  },

  async _auth(grant, corpo) {
    const c = Central.cfg;
    const r = await fetch(`${c.sbUrl}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST', headers: { apikey: c.anon, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = d.error_description || d.msg || d.error || '';
      if (/invalid/i.test(msg)) throw new Error(grant === 'password' ? 'Usuário ou senha incorretos.' : 'Sessão expirada. Entre de novo.');
      if (/banned/i.test(msg)) throw new Error('Usuário desativado. Fale com o administrador.');
      throw new Error(msg || 'Falha no login.');
    }
    c.access = d.access_token;
    c.refresh = d.refresh_token;
    c.expira = Date.now() + (Number(d.expires_in || 3600) - 120) * 1000;
    c.userId = d.user.id;
    await Central.guardar();
  },

  async rest(metodo, tabela, params = {}, corpo = null, prefer = null) {
    const c = Central.cfg;
    if (!c) throw new Error('Entre com o seu usuário.');
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      if (!c.access || Date.now() > c.expira) await Central._auth('refresh_token', { refresh_token: c.refresh });
      const url = `${c.sbUrl}/rest/v1/${tabela}?` + new URLSearchParams(params);
      const h = { apikey: c.anon, Authorization: `Bearer ${c.access}`, 'Content-Type': 'application/json' };
      if (prefer) h.Prefer = prefer;
      let r;
      try { r = await fetch(url, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined }); }
      catch (e) { throw new Error('Sem conexão com a central.'); }
      if (r.status === 401 && tentativa === 1) { c.access = ''; continue; }
      const txt = await r.text();
      const d = txt ? JSON.parse(txt) : null;
      if (!r.ok) throw new Error((d && (d.message || d.msg)) || `Erro ${r.status}`);
      return d;
    }
  },

  // pega a consulta mais antiga da fila que tenha algo a fazer nos sites livres (sem login pendente)
  async proximaConsulta(livres) {
    if (!livres.length) return null;
    const params = { user_id: `eq.${Central.cfg.userId}`, status: 'eq.pendente', order: 'id.asc', limit: '1', select: '*' };
    if (livres.length === 1) params[`${livres[0]}_status`] = 'neq.ok';
    const fila = await Central.rest('GET', 'consultas', params);
    if (!fila || !fila.length) return null;
    const c = fila[0];
    const pegou = await Central.rest('PATCH', 'consultas', { id: `eq.${c.id}`, status: 'eq.pendente' },
      { status: 'consultando', maquina: 'Chrome (extensão)' }, 'return=representation');
    return pegou && pegou[0] ? pegou[0] : null;
  },

  atualizarConsulta(id, campos) {
    return Central.rest('PATCH', 'consultas', { id: `eq.${id}` }, campos, 'return=minimal');
  },

  // consultas que ficaram "consultando" porque o painel foi fechado no meio: voltam para a fila
  recuperarPresas() {
    return Central.rest('PATCH', 'consultas', { user_id: `eq.${Central.cfg.userId}`, status: 'eq.consultando', maquina: 'eq.Chrome (extensão)' },
      { status: 'pendente' }, 'return=minimal');
  },

  async contar() {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const base = { user_id: `eq.${Central.cfg.userId}`, select: 'id' };
    const [fila, prontas] = await Promise.all([
      Central.rest('GET', 'consultas', { ...base, status: 'in.(pendente,consultando)' }),
      Central.rest('GET', 'consultas', { ...base, status: 'eq.pronta', concluido_em: `gte.${hoje.toISOString()}` }),
    ]);
    return { fila: (fila || []).length, prontas: (prontas || []).length };
  },
};
