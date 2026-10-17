// POST /api/ler-recibo  { imagem: "<base64 jpeg>" }  ->  { veiculos: [{placa, renavam, alerta}], alerta }
// Lê placa e Renavam do recibo do veículo (ou de uma lista fotografada) para as consultas no Detran/IPVA.
const { faltaConfig, responder, lerCorpo, autenticar, claude, extrairJSON, tratarErro } = require('./_lib');

const INSTRUCOES = `Você extrai a PLACA e o RENAVAM de veículos em fotos de recibos de compra e venda,
CRV/ATPV, CRLV, documentos de veículo ou listas, para consulta de débitos e restrições.
Chame SEMPRE a ferramenta registrar_veiculos (nunca responda só em texto).

Regras:
- placa: só letras e números, maiúsculas, sem traço (ex.: EFY0980, QNE1G48). Padrões válidos:
  3 letras + 4 números (antigo) ou 3 letras + número + letra + 2 números (Mercosul).
- renavam: só os números, como aparecem no documento (normalmente 9 a 11 dígitos). Não invente
  dígitos. Se estiver ilegível, use "".
- Se a foto tiver vários veículos (ex.: uma lista), devolva todos, na ordem em que aparecem.
- Não confunda Renavam com chassi, número do CRV, código de segurança, CPF/CNPJ ou telefone.
- alerta: texto curto se algo estiver ilegível ou incerto. Senão "".`;

const FERRAMENTA = {
  name: 'registrar_veiculos',
  description: 'Registra os veículos encontrados na foto.',
  input_schema: {
    type: 'object',
    properties: {
      veiculos: {
        type: 'array',
        items: {
          type: 'object',
          properties: { placa: { type: 'string' }, renavam: { type: 'string' }, alerta: { type: 'string' } },
          required: ['placa', 'renavam', 'alerta'],
        },
      },
      alerta: { type: 'string' },
    },
    required: ['veiculos', 'alerta'],
  },
};

// dígito verificador do Renavam (11 dígitos)
function renavamValido(r) {
  if (!/^\d{11}$/.test(r)) return false;
  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = pesos.reduce((s, p, i) => s + p * Number(r[i]), 0);
  const dv = (soma * 10) % 11 % 10;
  return dv === Number(r[10]);
}

function normalizar(v) {
  const placa = String(v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digitos = String(v.renavam || '').replace(/\D/g, '');
  const renavam = digitos ? digitos.padStart(11, '0') : '';
  const alertas = [String(v.alerta || '').trim()].filter(Boolean);
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) alertas.push('Placa fora do padrão: confira.');
  if (!renavam) alertas.push('Renavam não encontrado: digite.');
  else if (digitos.length > 11 || !renavamValido(renavam)) alertas.push('Renavam com dígito verificador errado: confira.');
  return { placa, renavam, alerta: alertas.join(' ') };
}

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
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: 'Extraia placa e Renavam.' },
        ],
      }],
    });
    const d = extrairJSON(resposta, 'registrar_veiculos');
    const veiculos = (d.veiculos || []).map(normalizar).filter((v) => v.placa || v.renavam);
    responder(res, 200, { veiculos, alerta: String(d.alerta || '').trim() });
  } catch (e) {
    tratarErro(res, e);
  }
};

module.exports.renavamValido = renavamValido;
module.exports.normalizar = normalizar;
