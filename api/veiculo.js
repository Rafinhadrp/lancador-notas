// POST /api/veiculo  { imagem: "<base64 png>", placa, largura, altura }
// Usado pelo programa do PC: recebe o print da lista de sugestões do campo Veículo
// e devolve qual opção tem a data mais recente e onde ela está na imagem.
const { faltaConfig, responder, lerCorpo, autenticar, claude, extrairJSON, tratarErro } = require('./_lib');

const PERGUNTA = (placa, w, h) => `Esta imagem é um recorte da tela: um campo de busca de veículo e, logo abaixo,
a lista de sugestões que apareceu. Cada opção da lista começa com a placa (ex.: "ARW4040 - Corsa - ...")
e tem uma data DD/MM/AAAA perto do final. A placa buscada é ${placa || '(não informada)'}.
Escolha a opção dessa placa com a data MAIS RECENTE.
Responda SÓ com JSON, sem mais nada:
{"quantidade": <número de opções na lista>, "escolhida": <posição da escolhida, 1 = a de cima>,
 "y": <coordenada Y em pixels do MEIO do texto da opção escolhida nesta imagem>,
 "texto": "<texto da opção escolhida>"}
A imagem tem ${w} x ${h} pixels. Se não houver nenhuma opção na lista, responda {"quantidade": 0}.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Use POST' });
  const falta = faltaConfig();
  if (falta) return responder(res, 500, { erro: falta });
  try {
    await autenticar(req);
    const { imagem, placa, largura, altura } = await lerCorpo(req);
    if (!imagem) return responder(res, 400, { erro: 'Imagem não recebida.' });
    const resposta = await claude({
      model: process.env.MODELO_VEICULO || 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imagem } },
          { type: 'text', text: PERGUNTA(placa, largura, altura) },
        ],
      }],
    });
    const d = extrairJSON(resposta);
    responder(res, 200, {
      quantidade: Number(d.quantidade || 0),
      escolhida: Number(d.escolhida || 0),
      y: Number(d.y || 0),
      texto: String(d.texto || ''),
    });
  } catch (e) {
    tratarErro(res, e);
  }
};
