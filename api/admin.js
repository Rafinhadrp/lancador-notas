// POST /api/admin  { acao, ...dados }
// Gerencia usuários da equipe. Só administradores (exceto "primeiro_admin", usado uma única vez).
const { DOMINIO, faltaConfig, responder, lerCorpo, sbAdmin, autenticar, tratarErro } = require('./_lib');

const limparUsuario = (u) => String(u || '').trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9._-]/g, '');

function validar({ usuario, nome, senha }, exigirSenha = true) {
  if (!usuario || usuario.length < 3) throw Object.assign(new Error('Usuário precisa de pelo menos 3 letras (sem espaço).'), { status: 400 });
  if (!nome || !String(nome).trim()) throw Object.assign(new Error('Informe o nome.'), { status: 400 });
  if (exigirSenha && (!senha || String(senha).length < 6)) throw Object.assign(new Error('Senha precisa de pelo menos 6 caracteres.'), { status: 400 });
}

async function criarUsuario({ usuario, nome, senha, admin }) {
  const u = await sbAdmin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: `${usuario}@${DOMINIO}`,
      password: senha,
      email_confirm: true,
      user_metadata: { usuario, nome },
    }),
  }).catch((e) => {
    if (/already|registered|exists/i.test(e.message)) e.message = 'Esse usuário já existe.';
    throw e;
  });
  const id = u.id || (u.user && u.user.id);
  try {
    await sbAdmin('/rest/v1/perfis', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ id, usuario, nome: String(nome).trim(), admin: !!admin, ativo: true }),
    });
  } catch (e) {
    await sbAdmin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' }).catch(() => {});
    throw e;
  }
  return id;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST' });
  const falta = faltaConfig();
  if (falta) return responder(res, 500, { erro: falta });
  try {
    const corpo = await lerCorpo(req);
    const acao = corpo.acao;

    // ---- primeiro administrador: só funciona enquanto não existe nenhum usuário
    if (acao === 'primeiro_admin') {
      const algum = await sbAdmin('/rest/v1/perfis?select=id&limit=1');
      if (algum && algum.length) return responder(res, 403, { erro: 'O administrador já foi criado.' });
      const dados = { usuario: limparUsuario(corpo.usuario), nome: corpo.nome, senha: corpo.senha, admin: true };
      validar(dados);
      await criarUsuario(dados);
      return responder(res, 200, { ok: true });
    }

    const { user } = await autenticar(req, { exigirAdmin: true });

    if (acao === 'listar') {
      const [perfis, agentes] = await Promise.all([
        sbAdmin('/rest/v1/perfis?select=*&order=nome.asc'),
        sbAdmin('/rest/v1/agentes?select=*'),
      ]);
      const porId = Object.fromEntries((agentes || []).map((a) => [a.user_id, a]));
      return responder(res, 200, { usuarios: perfis.map((p) => ({ ...p, agente: porId[p.id] || null })) });
    }

    if (acao === 'criar') {
      const dados = { usuario: limparUsuario(corpo.usuario), nome: corpo.nome, senha: corpo.senha, admin: !!corpo.admin };
      validar(dados);
      await criarUsuario(dados);
      return responder(res, 200, { ok: true });
    }

    const id = String(corpo.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return responder(res, 400, { erro: 'Usuário inválido.' });
    const proprio = id === user.id;

    if (acao === 'atualizar') {
      const mudar = {};
      if (typeof corpo.nome === 'string' && corpo.nome.trim()) mudar.nome = corpo.nome.trim();
      if (typeof corpo.admin === 'boolean') {
        if (proprio && !corpo.admin) return responder(res, 400, { erro: 'Você não pode tirar o seu próprio acesso de administrador.' });
        mudar.admin = corpo.admin;
      }
      if (typeof corpo.ativo === 'boolean') {
        if (proprio && !corpo.ativo) return responder(res, 400, { erro: 'Você não pode desativar a si mesmo.' });
        mudar.ativo = corpo.ativo;
      }
      await sbAdmin(`/rest/v1/perfis?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(mudar) });
      if (mudar.ativo === false) {
        // derruba as sessões abertas do usuário desativado
        await sbAdmin(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ ban_duration: '876000h' }) }).catch(() => {});
      } else if (mudar.ativo === true) {
        await sbAdmin(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ ban_duration: 'none' }) }).catch(() => {});
      }
      return responder(res, 200, { ok: true });
    }

    if (acao === 'senha') {
      if (!corpo.senha || String(corpo.senha).length < 6) return responder(res, 400, { erro: 'Senha precisa de pelo menos 6 caracteres.' });
      await sbAdmin(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ password: corpo.senha }) });
      return responder(res, 200, { ok: true });
    }

    if (acao === 'excluir') {
      if (proprio) return responder(res, 400, { erro: 'Você não pode excluir a si mesmo.' });
      await sbAdmin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
      return responder(res, 200, { ok: true });
    }

    responder(res, 400, { erro: 'Ação desconhecida.' });
  } catch (e) {
    tratarErro(res, e);
  }
};
