// Funções compartilhadas das APIs (arquivos que começam com "_" não viram rota no Vercel).

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DOMINIO = 'lancador.local'; // e-mail interno: usuario@lancador.local

function faltaConfig() {
  const faltando = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY']
    .filter((k) => !process.env[k]);
  return faltando.length ? `Configuração incompleta no Vercel: ${faltando.join(', ')}` : null;
}

function responder(res, status, corpo) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const partes = [];
  for await (const p of req) partes.push(p);
  const txt = Buffer.concat(partes).toString('utf8');
  return txt ? JSON.parse(txt) : {};
}

// chamadas com a chave secreta (só no servidor)
async function sbAdmin(caminho, opcoes = {}) {
  const r = await fetch(`${SUPABASE_URL}${caminho}`, {
    ...opcoes,
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {}),
    },
  });
  const txt = await r.text();
  let dados = null;
  try { dados = txt ? JSON.parse(txt) : null; } catch { dados = txt; }
  if (!r.ok) {
    const msg = (dados && (dados.msg || dados.message || dados.error_description || dados.error)) || txt;
    const e = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    e.status = r.status;
    throw e;
  }
  return dados;
}

// confere o token de login enviado pelo celular/PC e devolve {user, perfil}
async function autenticar(req, { exigirAdmin = false } = {}) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) { const e = new Error('Faça login novamente.'); e.status = 401; throw e; }

  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) { const e = new Error('Sessão expirada. Faça login novamente.'); e.status = 401; throw e; }
  const user = await r.json();

  const perfis = await sbAdmin(`/rest/v1/perfis?id=eq.${user.id}&select=*`);
  const perfil = perfis && perfis[0];
  if (!perfil || !perfil.ativo) { const e = new Error('Usuário desativado.'); e.status = 403; throw e; }
  if (exigirAdmin && !perfil.admin) { const e = new Error('Só administradores.'); e.status = 403; throw e; }
  return { user, perfil };
}

// chamada à API do Claude (sem bibliotecas extras)
async function claude({ model, system, messages, tools, max_tokens = 1024 }) {
  const corpo = { model, max_tokens, messages };
  if (system) corpo.system = system;
  if (tools) { corpo.tools = tools; corpo.tool_choice = { type: 'auto' }; }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(corpo),
  });
  const dados = await r.json();
  if (!r.ok) {
    const e = new Error(dados?.error?.message || `Erro na API do Claude (${r.status})`);
    e.status = 502;
    throw e;
  }
  return dados;
}

function extrairJSON(resposta, nomeFerramenta) {
  const uso = (resposta.content || []).find((b) => b.type === 'tool_use' && (!nomeFerramenta || b.name === nomeFerramenta));
  if (uso) return uso.input;
  const texto = (resposta.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const i = texto.indexOf('{'), f = texto.lastIndexOf('}');
  if (i < 0 || f < 0) throw new Error('Resposta do Claude sem dados.');
  return JSON.parse(texto.slice(i, f + 1));
}

function tratarErro(res, e) {
  if (!e.status || e.status >= 500) console.error(e);
  responder(res, e.status || 500, { erro: e.message || 'Erro inesperado' });
}

module.exports = {
  SUPABASE_URL, ANON, DOMINIO, faltaConfig, responder, lerCorpo, sbAdmin, autenticar, claude, extrairJSON, tratarErro,
};
