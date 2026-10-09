// POST /api/ler  { imagem: "<base64 jpeg>" }  ->  dados da nota já no formato do sistema
const { faltaConfig, responder, lerCorpo, autenticar, claude, extrairJSON, tratarErro } = require('./_lib');

const INSTRUCOES = `Você extrai dados de notas, cupons, recibos e ordens de serviço de oficinas e autopeças
para lançamento no sistema da revenda de veículos AUTOFORTE (a cliente das notas).
Chame SEMPRE a ferramenta registrar_nota (nunca responda só em texto).

Regras:
- data: a data de referência da nota em DD/MM (sem ano).
  * Cupom de autopeças com campo "Sit.:" -> use a data do Sit. (ignore a data do ORCAMENTO).
  * OS / documento auxiliar de venda -> use a data da OS (campo "Data:"), não a data de impressão do relatório.
  * Nota escrita à mão -> use "Data Entrada" (ou "Data Saída" se só ela existir).
- placa: só letras e números, maiúsculas, sem espaço nem traço (ex.: QNE1G48). Costuma estar em Obs,
  no campo Placa ou junto do veículo. Se não houver placa, use "".
- itens: descrição de cada peça/serviço em MAIÚSCULAS e sem acento, como aparece na nota, sem os códigos
  numéricos do início da linha (ex.: "756333 SINTECH BRONZINA MANCAL FT 025" -> "SINTECH BRONZINA MANCAL FT 025").
  Remova hífens soltos no final. Se a linha de serviço for um código genérico
  (ex.: "Serv.Inst.Mant.Acess.P/Veiculos") e a observação detalhar os serviços, use os serviços da observação
  (ex.: "LIMPEZA NO CONDENSADOR", "MAO DE OBRA"). Corrija erros óbvios de letra de mão (ex.: "supuior" -> "SUPERIOR").
- valor: valor líquido/total da nota no formato brasileiro, com vírgula e 2 casas (ex.: 126,27; 1.842,61).
  Em nota manuscrita use o "Total pedido", não valores de fechamento acumulado escritos à parte.
- fornecedor: nome do emitente da nota, se aparecer. Senão "".
- cnpj_fornecedor: CNPJ do emitente (NUNCA o da Autoforte, 10.696.802/0001-31). Senão "".
- alerta: texto curto se algo estiver ilegível ou incerto, se não houver placa, ou se a soma dos itens não
  bater com o total. Senão "".`;

const FERRAMENTA = {
  name: 'registrar_nota',
  description: 'Registra os dados extraídos da nota.',
  input_schema: {
    type: 'object',
    properties: {
      data: { type: 'string' },
      placa: { type: 'string' },
      itens: { type: 'array', items: { type: 'string' } },
      valor: { type: 'string' },
      fornecedor: { type: 'string' },
      cnpj_fornecedor: { type: 'string' },
      alerta: { type: 'string' },
    },
    required: ['data', 'placa', 'itens', 'valor', 'fornecedor', 'cnpj_fornecedor', 'alerta'],
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST' });
  const falta = faltaConfig();
  if (falta) return responder(res, 500, { erro: falta });
  try {
    await autenticar(req);
    const { imagem } = await lerCorpo(req);
    if (!imagem || imagem.length < 100) return responder(res, 400, { erro: 'Foto não recebida.' });
    const base64 = imagem.replace(/^data:image\/\w+;base64,/, '');

    const resposta = await claude({
      model: process.env.MODELO || 'claude-sonnet-5-5',
      system: INSTRUCOES,
      tools: [FERRAMENTA],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: 'Extraia os dados desta nota.' },
        ],
      }],
    });

    const d = extrairJSON(resposta, 'registrar_nota');
    const itens = (d.itens || []).map((i) => String(i).trim().replace(/[-\s]+$/, '')).filter(Boolean);
    const data = String(d.data || '').trim();
    responder(res, 200, {
      data,
      placa: String(d.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
      itens,
      descricao: [data, itens.join(' + ')].filter(Boolean).join(' '),
      valor: String(d.valor || '').trim(),
      fornecedor: String(d.fornecedor || '').trim(),
      cnpj_fornecedor: String(d.cnpj_fornecedor || '').trim(),
      alerta: String(d.alerta || '').trim(),
    });
  } catch (e) {
    tratarErro(res, e);
  }
};
