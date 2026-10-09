# Lançador de Notas · contexto do projeto

Responda sempre em **português**. O dono do projeto é o Rafael (marca **Rafinhadr**), da revenda de veículos **Autoforte** (Araraquara/SP).

## O que é
A equipe fotografa no celular notas de oficinas e autopeças. O Claude lê a nota, a pessoa confere e o **programa do PC dela** preenche o lançamento no sistema web **Autos 360** (tela "Nova Receita e Despesa de Veículo"). Esse sistema **não tem API**: o preenchimento é feito simulando mouse e teclado (pyautogui).

## Arquitetura
- `index.html` + `assets/`: app do celular (PWA). Usa supabase-js pelo CDN, `assets/comum.js` (funções compartilhadas) e `assets/estilo.css` (tema escuro, azul da logo `#7db4f8`, fonte IBM Plex).
- `admin.html`: painel do administrador (equipe, histórico geral, exportar CSV, download do .exe).
- `api/` (funções do Vercel, Node, sem dependências):
  - `ler.js`: lê a foto com o Claude (tool use `registrar_nota`) e monta a descrição.
  - `veiculo.js`: recebe o print da lista de veículos e devolve a opção com a data mais recente e a coordenada Y dela.
  - `admin.js`: gerencia usuários com a chave secreta (inclui `primeiro_admin`).
  - `config.js`: devolve a URL e a chave anon do Supabase e o `LINK_PROGRAMA`.
  - `_lib.js`: funções compartilhadas.
- `supabase/schema.sql`: tabelas `perfis`, `notas` (status: pendente → lancando → lancada/erro/cancelada) e `agentes` (batimento do PC), com RLS. Cada usuário vê só as próprias notas; o admin vê todas. É idempotente.
- `agente/` (programa do PC, Windows, customtkinter):
  - `lancador.py`: interface com as telas Início, Calibragem, Ajustes e Histórico.
  - `central.py`: REST do Supabase e login.
  - `automacao.py`: preenchimento com mouse e teclado.
  - O PC consulta a fila a cada ~1,2 s e "pega" a nota com um PATCH condicional (`status=eq.pendente`), para nunca lançar a mesma nota duas vezes.
- `agente/navegador.py`: modo navegador (Playwright), ver abaixo.
- `.github/workflows/programa-pc.yml`: gera o `LancadorNotas.exe` (PyInstaller) e publica na release `programa`.
- Login: o usuário vira o e-mail interno `usuario@lancador.local`. Os usuários são criados só pelo admin, sem cadastro público.

## XML da NF-e
- No app há o botão **Arquivo XML da nota**: `App.lerNFe()` (em `assets/comum.js`) lê o XML no próprio navegador, sem IA.
- data = `dhEmi` (DD/MM), itens = `det/prod/xProd`, valor = `ICMSTot/vNF`, fornecedor = `emit/xNome`.
- Placa: procurada em `infCpl`, `infAdFisco`, `xPed`, `infAdProd` e `obsCont`. Se não achar, a pessoa digita.
- Alertas: nota de devolução (`finNFe=4` ou natOp com DEVOLUC), não autorizada (`cStat` ≠ 100/150), destinatário diferente da Autoforte (CNPJ 10696802000131).

## Modo navegador (agente/navegador.py, Playwright)
- Ajustes → "Como lançar no sistema": **Navegador** ou **Mouse e teclado** (`ajustes.modo`, padrão `mouse`).
- Abre uma janela própria do Chrome (ou Edge) com perfil em `%APPDATA%\LancadorNotas\navegador`. A pessoa faz login no Autos 360 nela uma vez.
- O endereço da tela do formulário fica em `ajustes.url_formulario` (guardado sozinho). Se o formulário ainda tem dados, a página é recarregada antes da próxima nota.
- Seletores do Autos 360 (PrimeReact): `input[name="veiculo"]` (autocomplete), `input[name="descricao"]`, `input[name="valor"]` (máscara de moeda: digita só os números), `button[aria-label="Salvar"]` (fica `disabled` até o formulário estar completo).
- Opção da lista: `EFY0980 - Fox - ... - Estoque - 14/04/2026 - Autoforte Veículos`. Escolhe a da placa com a maior data DD/MM/AAAA, sem IA.
- Confirmação: toast `.p-toast-message-success` / `.p-toast-message-error`, ou formulário limpo. Clique manual em Salvar é detectado por um listener que grava no sessionStorage.
- Testado só contra uma página que imita o formulário. **Ainda não testado no Autos 360 de verdade.**

## Regras de negócio (decididas com o usuário)
- **Descrição**: `DD/MM ITEM 1 + ITEM 2 + ...` (data em DD/MM, sem ano), em maiúsculas e sem acento. Ex.: `10/09 ELRING COLA SILICONE ELRING PRETO 70GR + SINTECH BRONZINA BIELA FT 025 + VOX FILTRO OLEO FT`.
- **Data da descrição**:
  - cupom de autopeças → data do campo **Sit.** (não a do ORÇAMENTO);
  - OS / documento auxiliar → data da OS (não a data de impressão);
  - nota manuscrita → **Data Entrada**.
- **Valor** = valor líquido/total da nota, em formato BR (`126,27`). Em nota manuscrita, usar o "Total pedido", não um "fechamento" acumulado escrito à parte.
- **Placa**: sem traço, maiúscula (ex.: `QNE1G48`). Fica em Obs, no campo Placa ou junto do veículo.
- Serviço genérico (ex.: "Serv.Inst.Mant.Acess.P/Veiculos") com detalhamento na observação → usar os serviços da observação.
- **No formulário, o programa preenche só**: Veículo → Descrição → Valor → Salvar. **Não mexe** em Tipo, Data nem Cliente/Fornecedor.
- **Veículo**: digitar a placa, esperar a lista e escolher a opção com a **data mais recente** (podem vir 2 ou mais registros do mesmo carro). É preciso selecionar o item da lista, só digitar não basta.
- **Salvar automático** só quando o veículo foi encontrado. Se não foi, não salva: espera a pessoa clicar em Salvar (ou "Pular").
- Parar na hora: **F10** ou mouse no canto superior esquerdo.
- Calibragem por PC (posições X/Y de Veículo, Descrição, Valor e Salvar, mais a área do print da lista), editável na tela do programa e capturada com **F9**. Fica salva em `%APPDATA%\LancadorNotas\config.json`.
- Posições de referência no PC do Rafael (1920×1080): veículo 1438,548 · descrição 1453,738 · valor 1482,821 · salvar 1481,874.

## Infra
- Hospedagem: **Vercel** (Framework "Other"). Variáveis: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `LINK_PROGRAMA`, e opcionais `MODELO` (padrão `claude-sonnet-5-5`) e `MODELO_VEICULO` (padrão `claude-haiku-4-5`).
- Banco: **Supabase** (projeto próprio, separado do Site-rafinha). Desligar "Allow new users to sign up".
- Logo: `<R/>` do repositório Rafinhadrp/Site-rafinha (`img/rafinhalogo.png`). Os ícones e a logo já estão em `assets/` e `agente/`.

## Testes já feitos
- RLS testado num Postgres 16 real.
- APIs testadas com fetch simulado.
- Telas testadas com Playwright e supabase simulado.
- Automação testada com pyautogui simulado.
- **Ainda não testado**: a interface do .exe rodando no Windows e o deploy real no Vercel/Supabase.

## Ideias pendentes
- Trava opcional de acesso só pelo IP público da empresa (a equipe usa a mesma internet).
- Usar Supabase Realtime no lugar da consulta periódica (hoje a consulta é a cada ~1,2 s).
