# Lançador de Notas · Rafinhadr

Fotografe a nota no celular → o Claude lê → você confere → o programa do seu PC preenche o sistema sozinho.

```
 Celular (site)  ──►  Central no Vercel  ──►  Supabase (usuários, fila, histórico)
                          │                              │
                     API do Claude                       ▼
                                          Programa do PC de cada pessoa (.exe)
                                          preenche Veículo, Descrição, Valor e salva
```

| Pasta / arquivo | O que é |
|---|---|
| `index.html` | App do celular: login, foto, conferência, envio e histórico |
| `admin.html` | Painel: equipe, histórico geral, planilha e download do programa |
| `api/` | Funções do Vercel (leitura da nota, escolha do veículo, usuários) |
| `supabase/schema.sql` | Banco de dados com as regras de segurança |
| `agente/` | Programa do PC (Windows) |
| `.github/workflows/` | Gera o `LancadorNotas.exe` automaticamente no GitHub |

---

## Instalação (uma vez só, ~15 minutos)

### 1. GitHub
1. Crie o repositório (ex.: `lancador-notas`). **Público** é o mais simples: o link de download do programa funciona para todos. Nenhuma senha ou chave fica no código.
2. Envie todos estes arquivos para ele.
3. Na aba **Actions**, o GitHub gera o programa sozinho (~5 min). Quando terminar, ele aparece em **Releases → Programa do PC → LancadorNotas.exe**.

### 2. Supabase
1. Crie um **projeto novo** (separado do que você já usa).
2. **SQL Editor → New query** → cole todo o arquivo `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers** → desligue **“Allow new users to sign up”**. Assim só o administrador cria usuários.
4. **Project Settings → API Keys** → anote a **Project URL**, a chave **publishable (anon)** e a chave **secret (service_role)**.

### 3. Vercel
1. **Add New → Project** → importe o repositório → *Framework Preset*: **Other** → não mude mais nada.
2. Em **Environment Variables**, cadastre:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | Project URL do Supabase |
| `SUPABASE_ANON_KEY` | chave publishable / anon |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secret / service_role (**nunca** coloque em outro lugar) |
| `ANTHROPIC_API_KEY` | sua chave da API do Claude |
| `LINK_PROGRAMA` | `https://github.com/SEU-USUARIO/lancador-notas/releases/download/programa/LancadorNotas.exe` |
| `MODELO` *(opcional)* | modelo que lê as notas. Padrão: `claude-sonnet-5-5` |
| `MODELO_VEICULO` *(opcional)* | modelo que escolhe o veículo. Padrão: `claude-haiku-4-5` |

3. **Deploy**. O endereço fica parecido com `https://lancador-notas.vercel.app`.

> Uso dentro da empresa: os termos do Vercel pedem o plano **Pro** para uso comercial. Confira antes de decidir.

### 4. Primeiro acesso
1. Abra `https://SEU-ENDERECO.vercel.app/admin.html` → crie o **administrador** (você).
2. Na aba **Equipe**, cadastre cada pessoa com nome, usuário e senha inicial.

---

## Para cada pessoa da equipe

**No celular**
1. Abra o endereço da central e entre com o usuário.
2. iPhone: Compartilhar → **Adicionar à Tela de Início**. Android: menu ⋮ → **Instalar app**.

**No computador**
1. Baixe o programa (Painel → **Programa do PC**). Se o Windows avisar, clique em **Mais informações → Executar assim mesmo** (o aviso aparece porque o programa é novo e não tem assinatura paga).
2. Informe o endereço da central e entre com o **mesmo usuário do celular**.
3. Aba **Calibragem**: abra o formulário *Nova Receita e Despesa de Veículo* no Chrome → **Capturar todos em sequência** → para cada campo, mouse em cima + **F9**.
4. Use **Ver recorte** para confirmar que a lista de veículos aparece inteira.
5. Opcional, em **Ajustes**: ligue **Abrir junto com o Windows**.

Pronto. Deixe o programa aberto com o formulário na tela. O que chegar do celular é lançado sozinho.

---

## Como funciona o lançamento
1. O programa digita a placa e espera a lista aparecer.
2. Ele fotografa a lista. O Claude aponta o veículo com a **data mais recente**, e o programa clica nele.
3. Cola a descrição e o valor e clica em **Salvar**.
4. **Se o veículo não for encontrado, ele não salva.** O programa avisa, você escolhe o carro, clica em Salvar e ele segue para a próxima nota (ou use **Pular esta nota**).

**Parar na hora:** aperte **F10** ou jogue o mouse no canto superior esquerdo da tela. A nota volta para a fila e o programa fica pausado.

## Atualizar o programa do PC
A partir da versão 1.2.0, o programa avisa sozinho quando sai uma versão nova: aparece **"Nova versão disponível · Atualizar"** no Início. Clique e ele baixa, fecha e abre de novo já atualizado (login e ajustes continuam).

## Consultas de veículo (Detran e IPVA)
As consultas são feitas pela extensão **Lançador · Consultas** no seu Chrome normal (o login do gov.br não funciona na janela do programa).

**Instalar a extensão (uma vez por computador)**
1. Baixe o `LancadorConsultas.zip` em **Releases → Programa do PC** e extraia numa pasta fixa (ex.: `Documentos\LancadorConsultas`). Não apague essa pasta depois.
2. No Chrome, abra `chrome://extensions`, ligue **Modo do desenvolvedor** (canto superior direito) e clique em **Carregar sem compactação**. Escolha a pasta `LancadorConsultas`.
3. Fixe a extensão (ícone de quebra-cabeça → alfinete) e clique nela → **Abrir o painel**. Entre com o mesmo usuário do app.

**Usar**
1. No celular, aba **Consultas**: fotografe o recibo (ou **Colar lista de placas**), confira e envie.
2. Deixe a aba do **painel** aberta no Chrome. Ela abre abas do Detran e do IPVA, preenche placa e Renavam e salva cada resultado em PDF em `Downloads\Consultas Lançador`.
3. Quando um site pedir login, a extensão avisa (som + notificação) e mostra a aba: entre com o gov.br e ela continua sozinha.
4. Para imprimir tudo de uma vez: na pasta, selecione os PDFs → botão direito → **Imprimir**.

> Rode de novo o `supabase/schema.sql` no Supabase depois de atualizar (ele cria a tabela de consultas e não apaga nada).

## Avisos de recibo pelo WhatsApp (aba Recibos)
1. Rode o `supabase/avisos.sql` no Supabase (uma vez).
2. Atualize a extensão para a 1.1.0 (baixe o `LancadorConsultas.zip`, extraia por cima da pasta e clique em ↻ em `chrome://extensions`).
3. Deixe o **WhatsApp Web** conectado e o **painel da extensão** aberto no Chrome.
4. No celular, aba **Recibos**: escolha **Em nome de terceiro** ou **Em nome da loja**, fotografe os contratos daquela pilha, confira e toque em **Enviar**. A extensão manda as mensagens uma de cada vez, com uns 20 segundos entre um cliente e outro.

## Segurança
- Cada pessoa vê **só as próprias notas**. O administrador vê todas.
- Ninguém consegue virar admin, mexer na nota de outro ou criar usuário pelo navegador. Tudo isso é bloqueado no banco (RLS).
- Um usuário desativado perde o acesso na hora, no celular e no PC.
- As chaves secretas ficam **só** no Vercel.

## Problemas comuns
| Sintoma | Solução |
|---|---|
| Celular mostra “PC desconectado” | Abra o programa no PC, ou veja se ele perdeu a internet |
| Clica fora do campo | Refaça a **Calibragem**. Mudar o zoom do Chrome ou o tamanho da janela muda as posições |
| Escolhe o veículo errado | **Ver recorte**: a lista precisa aparecer inteira. Ou mude para “Teclado” em Ajustes |
| Lista não aparece a tempo | Ajustes → aumente **Espera da lista de veículos** |
| Algum campo fica vazio | Ajustes → aumente **Pausa entre os passos** |

Registro de atividade de cada PC: `%APPDATA%\LancadorNotas\registro.txt`

---
feito por **Rafinhadr**
