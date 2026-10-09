// GET /api/config -> dados públicos para o site e o programa do PC se conectarem ao Supabase
const { SUPABASE_URL, ANON, DOMINIO, faltaConfig, responder, sbAdmin, tratarErro } = require('./_lib');

module.exports = async (req, res) => {
  const falta = faltaConfig();
  if (falta) return responder(res, 500, { erro: falta });
  try {
    const algum = await sbAdmin('/rest/v1/perfis?select=id&limit=1');
    responder(res, 200, {
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON,
      dominio: DOMINIO,
      precisaPrimeiroAdmin: !algum || algum.length === 0,
      linkPrograma: process.env.LINK_PROGRAMA || '',
    });
  } catch (e) {
    if (/perfis/.test(e.message || '')) {
      e.message = 'Banco ainda não preparado: rode o arquivo supabase/schema.sql no SQL Editor do Supabase.';
    }
    tratarErro(res, e);
  }
};
