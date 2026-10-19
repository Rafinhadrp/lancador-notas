// POST /api/ler-contrato  { imagem: "<base64 jpeg>" }  ->  { nome, primeiro_nome, telefone, telefones, modelo, alerta }
// Lê do contrato de compra e venda o comprador (cliente), o telefone dele e o modelo do carro,
// para o aviso de "recibo pronto" pelo WhatsApp.
const { faltaConfig, responder, lerCorpo, autenticar, claude, extrairJSON, tratarErro } = require('./_lib');

const INSTRUCOES = `Você lê contratos/fichas de compra e venda de veículos da revenda AUTOFORTE VEÍCULOS
(Araraquara/SP) para avisar o CLIENTE pelo WhatsApp que o recibo do carro está pronto.
Chame SEMPRE a ferramenta registrar_contrato (nunca responda só em texto).

Regras:
- cliente: a pessoa que COMPROU o veículo da Autoforte (comprador / cliente / adquirente).
  NUNCA use a Autoforte, o vendedor da loja, o despachante nem o antigo proprietário do carro.
- nome: nome completo do cliente como está no contrato.
- telefones: todos os telefones do CLIENTE, só números, com DDD (ex.: 16981048733). Primeiro o celular.
  NUNCA inclua telefones da Autoforte (ex.: 16 3333-5399) nem de outras empresas.
- modelo: só o MODELO do carro, sem marca, versão, motor ou ano. Ex.: "VW/VOYAGE 1.6 MSI TOTAL FLEX" -> "Voyage";
  "GM/PRISMA 1.4 LTZ" -> "Prisma"; "FIAT STRADA FREEDOM CD" -> "Strada". Primeira letra maiúscula.
- placa: placa do carro, se aparecer (só letras e números). Senão "".
- alerta: texto curto se algo estiver ilegível, se não houver telefone, ou se houver mais de um comprador. Senão "".`;

const FERRAMENTA = {
  name: 'registrar_contrato',
  description: 'Registra os dados do cliente e do carro.',
  input_schema: {
    type: 'object',
    properties: {
      nome: { type: 'string' },
      telefones: { type: 'array', items: { type: 'string' } },
      modelo: { type: 'string' },
      placa: { type: 'string' },
      alerta: { type: 'string' },
    },
    required: ['nome', 'telefones', 'modelo', 'placa', 'alerta'],
  },
};

const LOJA = ['1633335399'];   // telefones da Autoforte: nunca mandar para eles

// "(16) 98104-8733" -> "5516981048733"; devolve "" se não parecer um telefone do Brasil
function normalizarTelefone(t) {
  let d = String(t || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 12 || d.length === 13) { if (!d.startsWith('55')) return ''; d = d.slice(2); }
  if (d.length !== 10 && d.length !== 11) return '';
  if (LOJA.includes(d)) return '';
  return '55' + d;
}

const titulo = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).trim();

const MARCAS = /^(VW|VOLKSWAGEN|GM|CHEVROLET|CHEV|FIAT|FORD|HONDA|TOYOTA|HYUNDAI|RENAULT|NISSAN|PEUGEOT|CITROEN|CITROËN|JEEP|MITSUBISHI|MMC|KIA|BMW|AUDI|MERCEDES(-BENZ)?|M\.BENZ|I\/|IMP)$/i;

// "VW/VOYAGE 1.6 MSI" -> "Voyage"; "Chevrolet Onix Plus" -> "Onix"
function soModelo(m) {
  let partes = String(m || '').split('/').pop().trim().split(/\s+/).filter(Boolean);
  while (partes.length > 1 && MARCAS.test(partes[0])) partes.shift();
  return titulo(partes[0] || '');
}

function primeiroNome(nome) {
  return titulo(String(nome || '').trim().split(/\s+/)[0] || '');
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
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: 'Extraia o cliente, o telefone e o modelo do carro.' },
        ],
      }],
    });
    const d = extrairJSON(resposta, 'registrar_contrato');
    const telefones = [...new Set((d.telefones || []).map(normalizarTelefone).filter(Boolean))];
    // celular (9 dígitos depois do DDD) primeiro
    telefones.sort((a, b) => (b.length === 13) - (a.length === 13));
    const alertas = [String(d.alerta || '').trim()].filter(Boolean);
    if (!telefones.length) alertas.push('Telefone do cliente não encontrado: digite.');
    else if (telefones[0].length !== 13) alertas.push('O telefone parece fixo (sem o 9): confira se tem WhatsApp.');
    responder(res, 200, {
      nome: titulo(d.nome),
      primeiro_nome: primeiroNome(d.nome),
      telefone: telefones[0] || '',
      telefones,
      modelo: soModelo(d.modelo),
      placa: String(d.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
      alerta: alertas.join(' '),
    });
  } catch (e) {
    tratarErro(res, e);
  }
};

module.exports.normalizarTelefone = normalizarTelefone;
module.exports.primeiroNome = primeiroNome;
module.exports.soModelo = soModelo;
