# Lançador de Notas · contexto do projeto

Responda sempre em **português**. O dono do projeto é o Rafael (marca **Rafinhadr**), da revenda de veículos **Autoforte** (Araraquara/SP).

## O que é
A equipe fotografa no celular notas de oficinas e autopeças. O Claude lê a nota, a pessoa confere e o **programa do PC dela** preenche o lançamento no sistema web **Autos 360** (tela "Nova Receita e Despesa de Veículo"). Esse sistema **não tem API**: o preenchimento é feito simulando mouse e teclado (pyautogui).

## Arquitetura
- `index.html` + `assets/`: app do celular (PWA). Usa supabase-js pelo CDN, `assets/comum.js` (funções compartilhadas) e `assets/estilo.css` (tema escuro, azul da logo `#7db4f8`, fonte IBM Plex). Abas: **Notas**, **Consultas** (`assets/consultas.js`), **Recibos** (`assets/recibos.js`) e **Histórico**.
- **Tema claro/escuro**: botão sol/lua no topo do app e do admin (`App.ligarBotaoTema`); salvo em `localStorage.tema`; o `<head>` aplica `data-tema="claro"` no `<html>` antes de desenhar. Cores todas em variáveis no `:root` / `:root[data-tema="claro"]` do `estilo.css` (nada de cor fixa nos componentes).
- **Abrir no celular**: botão de celular no topo do app e do admin (e link "Abrir no celular (QR code)" na tela de login) abre `App.abrirCelular()`: QR code do endereço do site (`location.origin`, `assets/qrcode.js` = qrcode-generator 1.4.4, MIT, carregado só nessa hora), como virar app no iPhone/Android e botão Copiar.
- `admin.html`: painel do administrador (equipe, histórico geral, exportar CSV, download do .exe).
- `api/` (funções do Vercel, Node, sem dependências):
  - `ler.js`: lê a foto com o Claude (tool use `registrar_nota`) e monta a descrição.
  - `veiculo.js`: recebe o print da lista de veículos e devolve a opção com a data mais recente e a coordenada Y dela.
  - `admin.js`: gerencia usuários com a chave secreta (inclui `primeiro_admin`).
  - `ler-recibo.js`: lê placa e Renavam da foto do recibo (tool use `registrar_veiculos`, aceita vários veículos) e valida o dígito do Renavam.
  - `ler-contrato.js`: lê do contrato o comprador (nome), telefones (normaliza para 55+DDD+número, descarta o da Autoforte 1633335399) e só o modelo do carro (`soModelo`: tira marca/versão, ex.: "VW/VOYAGE 1.6" → "Voyage").
  - `versao.js`: lê o `versao.json` da release `programa` (cache de 5 min) e devolve as versões atuais do programa e da extensão. O admin mostra na aba Downloads (selo "versão atual", botões com a versão e o tamanho, novidades) e na Equipe marca "desatualizado" no PC com versão menor (`agentes.versao`); o app mostra a versão no link "Baixar a extensão" (`App.versoes()` / `App.versaoMenor()`).
  - `config.js`: devolve a URL e a chave anon do Supabase e o `LINK_PROGRAMA`.
  - `_lib.js`: funções compartilhadas.
- `supabase/schema.sql`: tabelas `perfis`, `notas` (status: pendente → lancando → lancada/erro/cancelada), `consultas` (pendente → consultando → pronta/erro/cancelada, com `detran_status`/`ipva_status` ''/ok/erro) e `agentes` (batimento do PC), com RLS. Cada usuário vê só as próprias notas; o admin vê todas. É idempotente.
- `agente/` (programa do PC, Windows, customtkinter):
  - `lancador.py`: interface com as telas Início, Calibragem, Ajustes e Histórico.
  - `central.py`: REST do Supabase e login.
  - `automacao.py`: preenchimento com mouse e teclado.
  - O PC consulta a fila a cada ~1,2 s e "pega" a nota com um PATCH condicional (`status=eq.pendente`), para nunca lançar a mesma nota duas vezes.
- `agente/navegador.py`: modo navegador (Playwright), ver abaixo.
- `agente/consultas.py`: consultas no Detran e no IPVA (seletores na constante `SITES`), ver abaixo.
- `agente/atualizador.py`: atualização automática pela release do GitHub, ver abaixo.
- `extensao/`: extensão do Chrome **"Lançador · Consultas"** (Manifest V3), que faz as consultas no Chrome normal da pessoa. Ver abaixo.
- `.github/workflows/programa-pc.yml`: gera o `LancadorNotas.exe` (PyInstaller) e publica na release `programa`.
- **Conta principal (dono)**: o primeiro usuário criado (`criado_em` mais antigo, o do `primeiro_admin`) é o do Rafael. Pedido dele em 26/10/2026: outro admin **não** pode excluir, desativar, tirar o admin, trocar a senha nem renomear essa conta. O `api/admin.js` bloqueia (403) e o admin mostra o selo "principal" sem os botões. Só o próprio dono mexe nela.
- Login: o usuário vira o e-mail interno `usuario@lancador.local`. Os usuários são criados só pelo admin, sem cadastro público.

## Mascote <R/> (pixel art do Rafael)
- Estados: `parado`, `digitando`, `feliz`, `acenando`, `pensando`, `dormindo`, `erro` (+ `programando`, não usado). Sempre sem suavizar (`image-rendering: pixelated` / `Image.NEAREST`).
- App/site (`assets/mascote/*.gif`, 256px): `App.mascote(estado, 'mini'|'grande')`. Login = acenando, carregando = pensando, cartão lendo = digitando, falhou = erro, lista vazia = dormindo, avisos (toast) ok = feliz / erro = erro.
- Programa do PC (`agente/mascote/*.gif`, empacotado com `--add-data "mascote;mascote"`): classe `Mascote` (Label do tkinter animado). Login = acenando, conectando = pensando, cartão do Início: Pronto = parado, Lançando = digitando, lançada = feliz por 3 s, Esperando você = pensando, Pausado = dormindo, Sem conexão = erro.
- Extensão (`extensao/mascote.js`, `mascote/*.gif` 128px e `*-32.png` = folhas de quadros 32×32 + `tempos.json`): mascote no painel e **ícone animado no canto do Chrome** (`chrome.action.setIcon` quadro a quadro) com selo = tamanho da fila (consultas + avisos), "!" vermelho quando precisa de login/QR, "off" quando o painel fecha. O popup mostra o mascote e o estado do painel.
- Visual (pedido do Rafael: "mais profissional, menos poluído"): a logo grande saiu das telas de entrada. O mascote fica **sentado na borda de cima do cartão de login** (`.cartao.com-poleiro` + `.poleiro` / no PC `place(in_=cartão, anchor="s")`) com balão de saudação (`data-saudacao` = Bom dia/Boa tarde/Boa noite) e muda de humor no login (`App.humorLogin`: digitando → feliz ou erro). A logo fica pequena e apagada no rodapé, junto de "feito por Rafinhadr" (`.assinatura` / `_assinatura()` no PC).
- **Mascote na tela dos sites** (`extensao/overlay.js`, content script com Shadow DOM): só em `app.altimus.com.br` (Autos 360), `web.whatsapp.com`, `*.detran.sp.gov.br` e `*.fazenda.sp.gov.br` (sem permissão de "todos os sites"). Mostra o humor/estado do painel (`painelEstado`) e um balão ao passar o mouse; arrasta e lembra o lugar por site (`mascotePos`); duplo clique esconde no site (`mascoteOculto`), e o popup tem "Mostrar/Esconder o mascote neste site". No WhatsApp começa à esquerda (à direita fica o botão de enviar).
- **Tela de abertura do .exe** (como a do FL Studio): fundo `agente/splash.png` (540×270, cantos transparentes, "Lançador de Notas" + assinatura), ligado com `--splash splash.png`. O workflow roda `python gerar_exe.py` (mesmos argumentos do pyinstaller), que troca o script Tcl do splash por um animado: mascote **pensando** (quadros do GIF embutidos em base64) e barra que anda com os arquivos extraídos pelo bootloader (ou com o tempo) e com as fases que o programa manda. `agente/abertura.py` (importado primeiro no `lancador.py`) conversa com o splash pela porta `_PYI_SPLASH_IPC`: `fase("...")` troca a frase, `fechar()` enche a barra e fecha (chamado 300 ms depois de a janela abrir). Na 1.5.2 a tela não fechava (faltou o import); na 1.5.3 virou uma janela "tk" vazia porque o Tcl do splash **não carrega o init.tcl** (sem `min()`/`max()` e outros procs: usar só comandos em C; `raise .` vai num `catch`). Corrigido e conferido num Windows do GitHub Actions na 1.5.4 (exe de teste com `--debug bootloader`, que mostra `SPLASH: Tcl error: ...`).
- Links da extensão: aba **Downloads** do admin (cartão com passo a passo) e dica "Baixar a extensão" nas abas Consultas e Recibos do app. Atualização automática pela Chrome Web Store: deixada para depois (decisão do Rafael).

## XML da NF-e
- No app há o botão **Arquivo XML da nota**: `App.lerNFe()` (em `assets/comum.js`) lê o XML no próprio navegador, sem IA.
- data = `dhEmi` (DD/MM), itens = `det/prod/xProd`, valor = `ICMSTot/vNF`, fornecedor = `emit/xNome`.
- Placa: procurada em `infCpl`, `infAdFisco`, `xPed`, `infAdProd` e `obsCont`. Se não achar, a pessoa digita.
- Alertas: nota de devolução (`finNFe=4` ou natOp com DEVOLUC), não autorizada (`cStat` ≠ 100/150), destinatário diferente da Autoforte (CNPJ 10696802000131).

## Modo navegador (agente/navegador.py, Playwright)
- Ajustes → "Como lançar no sistema": **Navegador** ou **Mouse e teclado** (`ajustes.modo`, padrão `mouse`).
- Abre uma janela própria do Chrome (ou Edge) com perfil em `%APPDATA%\LancadorNotas\navegador`. A pessoa faz login no Autos 360 nela uma vez.
- A janela abre **sem a marca de navegador automatizado** (`ignore_default_args=["--enable-automation"]` + `--disable-blink-features=AutomationControlled`): os sites do governo de SP ficavam "carregando para sempre" na janela marcada e abriam no Chrome normal (confirmado pelo Rafael em 17/10/2026, que autorizou a mudança). Login e captcha continuam sempre com a pessoa.
- Downloads: na janela controlada o Chrome salva downloads numa pasta temporária com nome aleatório e sem extensão. `Navegador._baixou` salva cada download de verdade: em `~/Downloads` com o nome sugerido, ou, se veio de uma aba de consulta (`nome_por_aba`), na pasta das consultas como `PLACA_SITE_AAAA-MM-DD_SITE.pdf`. Quando o programa está parado, `bombear()` mantém os eventos chegando.
- O endereço da tela do formulário fica em `ajustes.url_formulario` (guardado sozinho). Se o formulário ainda tem dados, a página é recarregada antes da próxima nota.
- Seletores do Autos 360 (PrimeReact): `input[name="veiculo"]` (autocomplete), `input[name="descricao"]`, `input[name="valor"]` (máscara de moeda: digita só os números), `button[aria-label="Salvar"]` (fica `disabled` até o formulário estar completo).
- Opção da lista: `EFY0980 - Fox - ... - Estoque - 14/04/2026 - Autoforte Veículos`. Escolhe a da placa com a maior data DD/MM/AAAA, sem IA.
- Confirmação: toast `.p-toast-message-success` / `.p-toast-message-error`, ou formulário limpo. Clique manual em Salvar é detectado por um listener que grava no sessionStorage.
- Testado só contra uma página que imita o formulário. **Ainda não testado no Autos 360 de verdade.**

## Atualização automática do programa (agente/atualizador.py)
- O repositório é **público** (decisão do Rafael; uso interno). Nunca colocar senha/chave no código.
- O workflow publica na release `programa`: `LancadorNotas.exe` + `versao.json` (`versao` de `VERSAO` em `agente/central.py`, `obrigatoria` e `novidades` de `agente/versao.json`, `sha256`, `tamanho`).
- **Para lançar uma versão**: subir `VERSAO`, editar `agente/versao.json` e rodar o workflow (ele roda sozinho em push na `main` com mudança em `agente/**`, ou manual).
- O programa verifica ao abrir e a cada 1 h; mostra "Nova versão X disponível · Atualizar"; baixa para `%APPDATA%\LancadorNotas\atualizacao`, confere tamanho e sha256, espera a nota/consulta em andamento e troca o arquivo com `atualizar.bat` (espera o processo fechar, guarda `.old`, abre a nova com `PYINSTALLER_RESET_ENVIRONMENT=1`). O `.bat` roda com `CREATE_NO_WINDOW` (com `DETACHED_PROCESS` junto aparecia uma janela preta "find"); se o processo antigo não fechar em ~30 s, `taskkill /F`. O programa espera o Trabalhador fechar o navegador e sai com `os._exit(0)`. Falha → `atualizacao_falhou.txt`, avisado na próxima abertura. `obrigatoria: true` bloqueia os lançamentos até atualizar.
- Testado: verificação e download com hash contra o GitHub real. **Não testado**: a troca do arquivo no Windows.

## Extensão do Chrome "Lançador · Consultas" (extensao/) — jeito atual das consultas
- Motivo: o **login do gov.br não funciona na janela controlada pelo programa** (fica girando depois do CPF, confirmado pelo Rafael em 19/10/2026, mesmo sem a marca de automação). Não tentar contornar o gov.br.
- `painel.html/js` (aba fixa que fica aberta): login com o usuário do app (`central.js`: `/api/config` + auth/REST do Supabase, token em `chrome.storage.local`), fila de consultas e o trabalho nas abas. `sites.js`: `SITES` (seletores provisórios, iguais aos do Python) e as funções injetadas com `chrome.scripting` (`pgInspecionar`, `pgClicarAntes`, `pgPreencher` com setter nativo + eventos, `pgClicarConsultar`). `relogio.js`: timer num Worker (abas em segundo plano têm timers freados). `popup` só abre o painel.
- Mesma lógica do Python: login detectado → avisa (notificação + som), traz a aba e retoma sozinho; site que não abre → fecha a aba e tenta em 2 min; status por site; erro só repete pelo "Reenviar"; Pausar/Pular.
- **Sessão** (1.4.1, depois do Rafael ver "Sessão expirada" repetindo a cada 5 s): o Supabase troca o refresh token a cada uso e derruba a sessão se o mesmo for usado duas vezes. `Central.renovar()` faz uma renovação por vez (promessa única + `navigator.locks` entre painéis + relê o `conta` do storage antes). Se a renovação falhar de verdade (`e.sessao`), o painel para, avisa e volta para a tela de entrar. Só um painel aberto: um segundo foca o primeiro e se fecha.
- PDF: `chrome.debugger` + `Page.printToPDF` (aparece por um instante a faixa "começou a depurar") e `chrome.downloads` em `Downloads/<pasta de Ajustes>/PLACA_SITE_AAAA-MM-DD.pdf`.
- Instalação: release `programa` tem `LancadorConsultas.zip` (pasta `LancadorConsultas/`); extrair, `chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação. Versão em `extensao/manifest.json` (`versao.json` da release traz `extensao`; o painel avisa quando há nova, mas a troca é manual: extrair por cima e clicar em ↻).
- O programa do PC **não faz mais consultas** por padrão (`ajustes.consultas_no_programa = False`); dá para religar em Ajustes.
- Testado com Chromium + extensão carregada, central falsa (auth/REST) e sites falsos: login pedido e retomado, Renavam errado, sessão expirando, nada repetido. **Não testado nos sites de verdade.**

## Avisos de recibo pelo WhatsApp (aba Recibos + extensão)
- App, aba **Recibos**: escolhe a pilha **Em nome de terceiro** / **Em nome da loja** antes das fotos (fica salvo no aparelho), fotografa os contratos, confere nome (primeiro nome, vai na saudação), WhatsApp e modelo, vê a prévia em balões e envia para a tabela `avisos` (`supabase/avisos.sql`, também dentro do `schema.sql`). Avisa telefone já avisado nos últimos 30 dias. Histórico com Cancelar/Reenviar.
- Mensagens (uma por linha, cada linha é uma mensagem separada), editáveis em "Textos das mensagens" (localStorage do aparelho). Padrão, decidido com o Rafael:
  1. `{saudacao}, {nome}. Tudo bem?` 2. `Meu nome é {atendente}, da Autoforte Veículos.` 3. `Ficou pronta a documentação do {modelo} para você realizar a transferência.`
  4. terceiro: `Pode passar na loja para retirar o recibo.` · loja: `Você pretende realizar a transferência de forma digital ou presencial?`
  `{atendente}` = primeiro nome do usuário do app. `{saudacao}` fica guardado e é trocado na hora do envio (Bom dia < 12h, Boa tarde < 18h, Boa noite).
- Extensão (`extensao/whats.js` + `cicloAviso` no painel, com prioridade sobre as consultas): abre `web.whatsapp.com/send?phone=…`, envia cada mensagem (insertText + botão Enviar) com 3–6 s entre elas e **20 s (±) entre clientes** (Ajustes do painel, mínimo 10). Número inválido → erro e segue. QR code → pausa os avisos, avisa e continua quando conectar. Aviso interrompido no meio vira "erro" (nunca reenvia sozinho, para não repetir mensagens).
- **Risco combinado com o Rafael**: automação do WhatsApp Web não é autorizada pelo WhatsApp; ritmo lento e mensagens personalizadas reduzem o risco de bloqueio do número, mas não zeram.
- Testado com Chromium + extensão e um WhatsApp Web falso (ordem e intervalo das mensagens, número inválido, QR code no meio). **Não testado no WhatsApp Web de verdade** (os seletores `footer div[contenteditable]`, `button[aria-label="Enviar"]`, `.message-out` podem mudar).

## Consultas de veículo (Detran + IPVA)
- App: aba **Consultas** — foto do recibo (`/api/ler-recibo`) ou "Colar lista" (uma linha por veículo, placa e Renavam em qualquer ordem). Valida placa e dígito do Renavam (pesos 3,2,9,8,7,6,5,4,3,2; `(soma*10)%11%10`). Avisa placa já enviada hoje. Histórico com Detran/IPVA ok/erro e Reenviar.
- PC (desligado por padrão, ver extensão acima): depois das notas (prioridade), pega a consulta mais antiga e consulta os sites que faltam, cada um numa aba fixa da janela do navegador do Lançador (abas reservadas, o lançamento de notas não usa).
- URLs (logado): Detran `https://www.detran.sp.gov.br/detransp/pb/servicos/veiculos/consultar_debitos_restricoes?id=consultar_debitos_restricoes` (antes de preencher, clicar em **"Consultar veículos de outras pessoas"**, a conta é pessoal); IPVA `https://www3.fazenda.sp.gov.br/SIVEI/DebitosVinculados/Consulta`.
- Captcha e login gov.br **só na entrada**; depois várias consultas seguidas. O site desconecta por tempo/quantidade. O programa **nunca** resolve captcha nem faz login: detecta login (URL gov.br/login, captcha, campo de senha, ou formulário sumiu), pausa só aquele site (`precisa_login`), traz a aba para frente, avisa no Início com som e retoma sozinho quando a aba volta ao domínio do site e o formulário aparece. Cada site tem status próprio, então nada é repetido nem pulado.
- Resultado: seletor `resultado` (se definido) ou "formulário sumiu/URL mudou" ou "texto da página cresceu >300 caracteres". Erro: seletores `erro` com texto novo. PDF via CDP `Page.printToPDF` (se falhar, foto da página inteira em PDF) em `PLACA_DETRAN_AAAA-MM-DD.pdf` / `PLACA_IPVA_...pdf` na pasta de Ajustes (padrão `Documentos\Consultas Lançador`). "Imprimir automaticamente" abre o navegador com `--kiosk-printing` e chama `window.print()`.
- Ajustes: pasta, intervalo entre consultas (3 s), espera do resultado (40 s), imprimir automaticamente. Início: cartão "Consultas" com fila/prontas, "Pausar consultas" e "Pular consulta"; F10 para.
- Site que não responde: `goto(wait_until="commit", timeout=30s)`; se não abrir ou continuar carregando, a aba é fechada (em página "carregando", `count()`/`is_visible()`/`evaluate()` do Playwright travam para sempre; por isso `_visivel` usa `wait_for(timeout)`) e o site fica de fora por 2 min (`fora_ate`), sem marcar erro. A consulta só fica "pronta" quando os dois sites têm resposta; site com erro só é refeito pelo "Reenviar".
- **Fila do IPVA, passo a passo** (pedido do Rafael em 27/10/2026): no Autos 360 ele pesquisa `*7` (final da placa) e exporta a lista (.xls BIFF8 com colunas RENAVAM e PLACA, Renavam como texto com zero na frente). Na aba Consultas, botão **"Planilha do Autos 360"** (ou a Galeria: arquivo que não é foto vai para a importação) → `assets/planilha.js` (`Planilha.ler`: .xls/CFB+BIFF8, .xlsx, .csv/.txt, tabela HTML, sem biblioteca) → `Fila` em `assets/consultas.js` (salva no aparelho em `localStorage.filaIpva`). Filtro "Final da placa". Cada clique ("Consultar …" / "Consultar a próxima: …") insere **uma** consulta com `detran_status = 'pulado'` (só IPVA); o card acompanha o status e a extensão, ao terminar uma consulta de um site só, traz a aba do IPVA para a frente para a pessoa imprimir. Placa já consultada hoje = bolinha amarela no chip; Renavam inválido = riscado.
- `'pulado'` em `detran_status`/`ipva_status` = site que não precisa (o `schema.sql` tem o `alter table ... consultas_*_status_check` para bancos antigos: **rodar no Supabase**). Extensão 1.4.0 e o Python pulam esse site e filtram a fila com `not.in.(ok,pulado)`; o histórico esconde a etiqueta e o "Reenviar" mantém o pulado.
- **Seletores provisórios** (largos, por nome/id/placeholder/texto) em `SITES` no topo de `agente/consultas.py`. Falta o Rafael mandar o F12 dos campos placa, Renavam, botão Consultar, área de resultado e a tela de login de cada site.
- Testado contra sites falsos locais (login com captcha, botão "outras pessoas", erro de Renavam, resultado na mesma página, sessão que expira depois de N consultas, Pular, F10, PDF por foto). **Não testado nos sites de verdade.**

## Regras de negócio (decididas com o usuário)
- **Descrição**: `DD/MM ITEM 1 + ITEM 2 + ...` (data em DD/MM, sem ano), em maiúsculas e sem acento. Cada item é **só o nome do produto** (pedido do Rafael em 26/10/2026): sem códigos, referências, medidas nem marcas. Ex.: `PASTILHA FREIO DIANTEIRO 1423C` → `PASTILHA FREIO DIANTEIRO`, `BRONZINA MANCAL 77781610 030` → `BRONZINA MANCAL`, `CORREIA DENTADA CT1065` → `CORREIA DENTADA`, `FILTRO OLEO HU711/51X` → `FILTRO OLEO`. Linhas "RESOLUCAO DO SENADO.../FCI" não são itens. Além do prompt do `api/ler.js`, `soProduto()` (no `ler.js` e no `App.lerNFe`) corta no primeiro pedaço com número.
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
- Deploy real no Vercel/Supabase e o .exe no Windows: em uso pelo Rafael desde 09/10/2026.
- **Ainda não testado**: modo navegador e consultas nos sites de verdade; troca do arquivo na atualização automática.

## Ideias pendentes
- Trava opcional de acesso só pelo IP público da empresa (a equipe usa a mesma internet).
- Usar Supabase Realtime no lugar da consulta periódica (hoje a consulta é a cada ~1,2 s).
