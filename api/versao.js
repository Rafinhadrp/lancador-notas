// GET /api/versao -> versões atuais do programa do PC e da extensão (lidas do versao.json da release "programa")
const { responder } = require('./_lib');

const URL_VERSAO = 'https://github.com/Rafinhadrp/lancador-notas/releases/download/programa/versao.json';
let cache = null, quando = 0;

module.exports = async (req, res) => {
  try {
    if (!cache || Date.now() - quando > 5 * 60 * 1000) {
      const r = await fetch(URL_VERSAO, { redirect: 'follow' });
      if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
      const d = await r.json();
      cache = {
        programa: d.versao || '',
        extensao: d.extensao || '',
        novidades: d.novidades || '',
        obrigatoria: !!d.obrigatoria,
        tamanho: d.tamanho || 0,
        linkPrograma: 'https://github.com/Rafinhadrp/lancador-notas/releases/download/programa/LancadorNotas.exe',
        linkExtensao: 'https://github.com/Rafinhadrp/lancador-notas/releases/download/programa/LancadorConsultas.zip',
      };
      quando = Date.now();
    }
    responder(res, 200, cache);
  } catch (e) {
    responder(res, cache ? 200 : 502, cache || { erro: `Não consegui ler a versão atual (${e.message}).` });
  }
};
