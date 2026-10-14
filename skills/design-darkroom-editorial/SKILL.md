---
name: design-darkroom-editorial
description: Sistema visual "Darkroom Editorial" (referência ORYZO). Use SEMPRE que for criar, desenhar, estilizar ou revisar um site, landing page, página de produto, portfólio ou qualquer interface web nova, mesmo que o pedido não cite design, cores ou estilo. A skill é a fonte de verdade visual: define tokens, tipografia, componentes, layout, imagem e uma checklist de validação, e proíbe decisões visuais genéricas (azul padrão, sombras, cantos aleatórios, Tailwind cru).
---

# Darkroom Editorial · Sistema de design

> Um único objeto flutuando numa escuridão quente. A tipografia creme é a única decoração.

Esta skill transforma o `DESIGN.md` da ORYZO num sistema reutilizável. Ela vale para **qualquer** site novo: o produto, a marca e os textos mudam; a linguagem visual não.

---

## 0. Como usar esta skill (ler antes de escrever qualquer linha)

1. **Esta skill é a fonte de verdade.** Se algo aqui contradiz um hábito seu, um framework ou um "padrão de mercado", vale o que está aqui.
2. **Nunca invente valores.** Toda cor, tamanho, espaçamento, raio e peso sai das tabelas da seção 3. Se precisar de um valor que não existe, use o token mais próximo da escala. Se nenhum servir, siga o protocolo da seção 9 e **declare** a derivação ao usuário.
3. **Traduza o conteúdo, não o estilo.** "ORYZO", "porta-copos", "Lusion", "tapete de corte verde" são o conteúdo da referência. No projeto novo eles viram: o nome da marca, o objeto principal, o estúdio/autor e o contexto de uso daquele objeto (seção 2).
4. **Antes de entregar**, passe a checklist da seção 10 item por item. Uma página que falha em qualquer item **bloqueante** não está pronta.

---

## 1. Princípios (o porquê de cada regra)

| # | Princípio | O que significa na prática |
|---|-----------|----------------------------|
| P1 | **O objeto é o herói** | Cada tela tem um único protagonista visual (produto, peça, foto). Nada de UI competindo com ele: sem ícones decorativos, sem gradientes, sem ilustrações genéricas. |
| P2 | **Escuridão quente, nunca pura** | O fundo é `#100904` (quase preto amarronzado), o texto é `#ffedd7` (creme). `#000` e `#fff` "parecem errados" aqui. |
| P3 | **Raridade gera sinal** | O laranja aparece só em créditos. O botão preenchido aparece uma vez. Quanto mais raro, mais forte. |
| P4 | **Duas vozes tipográficas, nunca três** | MAIÚSCULA peso 500 = rótulo, declaração, museu. Caixa mista peso 400 em 29px = explicação. A troca de voz é o sinal de "agora você está lendo descrição". |
| P5 | **Profundidade sem sombra** | Elevação é só um passo de luminância (`#100904` → `#382416`). A profundidade real vem da foto/render 3D, nunca de `box-shadow`. |
| P6 | **Uma afirmação por tela** | Seções de 100vh, sem faixas comprimidas, sem cards dentro de cards, sem rodapé carregado. |
| P7 | **Linha antes de caixa** | Divisores tracejados de 1px, inputs só com linha inferior, links só com sublinhado, botão secundário só com contorno. A borda faz o trabalho; o preenchimento é exceção. |
| P8 | **Geometria encorpada** | Cantos de contêiner nunca abaixo de 12px; botões em pílula. Nada "afiado" além de inputs, links e imagens full-bleed. |
| P9 | **Tipografia escultural** | Títulos com line-height 0.9: as linhas se encostam e o bloco vira forma sólida. Sem tracking negativo: a geometria da fonte faz o trabalho. |
| P10 | **Artefato físico traduzido em UI** | Rótulo vertical tipo "número de série", créditos em micro-tipo, notas legais em Arial 8px. O site se comporta como a etiqueta de um objeto de museu. |

---

## 2. Tradução de conteúdo (o que muda de projeto para projeto)

| Na referência | No projeto novo | Regra |
|---|---|---|
| Wordmark "ORYZO" | Nome da marca em texto | Identidade **só tipográfica**: sem símbolo, sem ícone. Se o cliente exigir o logo dele, use-o monocromático creme e mantenha o wordmark como protagonista. |
| Porta-copos de cortiça | O objeto/produto principal | Isolado sobre `#100904`, centralizado, luz quente vinda de cima à direita, ângulo mudando entre seções (de cima → 3/4). |
| Tapete de corte verde, lápis, estilete | Ferramentas e materiais do ofício daquele produto | Só na foto do hero. A cor do contexto (ex.: `#445231`) **não vira token de UI**. |
| "ORYZO 1-MODEL" vertical | Nome + modelo/edição/série do produto | Rótulo vertical na margem direita, 10–12px. |
| "Designed by Lusion…" + link laranja | Crédito de autoria/estúdio/fabricante | Único lugar do laranja `#dc5000`. |
| "ISN'T JUST A COASTER." | Afirmação curta sobre o produto | Maiúscula, 41px, ≤ 5 palavras de preferência, termina com ponto. |
| "Designed to lift, insulate…" | Descrição do produto | Caixa mista, 29px, peso 400, 1–3 frases. Única voz conversacional. |

Tom de texto: declarativo, curto, confiante, sem exclamação, sem emoji, sem jargão de marketing ("revolucionário", "incrível"). Rótulos de museu, não anúncio.

---

## 3. Tokens (valores fixos)

### 3.1 Cores

| Token | Valor | Papel | Pode | Não pode |
|---|---|---|---|---|
| `--color-warm-cream` | `#ffedd7` | Todo texto, nav, bordas interativas, contorno de botão, linha de input | Qualquer texto e borda interativa | Ser trocado por `#fff` |
| `--color-walnut-shadow` | `#100904` | Canvas, fundo de toda seção (nível 0) | Fundo de página e seção | Ser trocado por `#000` |
| `--color-bark-brown` | `#382416` | Única superfície elevada (nível 1): fundo do botão preenchido | Botão preenchido, hover de botão fantasma (derivação, ver 9) | Fundo de seção inteira, card decorativo |
| `--color-cork-border` | `#40372e` | Divisores tracejados, bordas sutis de contêiner | Linhas de 1px | Texto |
| `--color-driftwood` | `#6c5f51` | Divisores secundários, elementos estruturais apagados | Linhas, detalhes estruturais | Texto de leitura (contraste insuficiente) |
| `--color-ember-accent` | `#dc5000` | Créditos, "Built by", link do estúdio/autor | Texto curto de crédito | Botão, CTA, fundo, ícone, hover, borda de foco |
| `--color-pure-black` | `#000000` | Preenchimento de SVG/vetor decorativo | Ícones vetoriais | Fundo, texto |

**Correção do documento original:** onde o `DESIGN.md` escreve `#40372` (5 dígitos, inválido), o valor correto é `#40372e`.

**Não existe cor de CTA.** Não invente uma (nem azul, nem verde, nem o laranja). A ação principal usa o botão preenchido Bark Brown.

### 3.2 Superfícies (pilha completa)

| Nível | Cor | Uso |
|---|---|---|
| 0 | `#100904` | Página e seções, full-bleed |
| 1 | `#382416` | Única superfície sólida elevada |
| 2 | `#40372e` | Linhas, divisores, contornos de card |
| 3 | `#ffedd7` | Primeiro plano: texto, nav, bordas interativas |

Não existe nível 4. Não existe "card cinza", "seção clara", "faixa de destaque colorida".

### 3.3 Tipografia

**Família única:** `halyard-display-variable` (Adobe Fonts). Substitutos na ordem: **Inter** → Söhne → Neue Haas Grotesk. Sempre com `font-feature-settings: "ss01" on`.
**Exceção única:** Arial 8px para micro-texto legal/compliance.

Pesos permitidos: **400 e 500**. Nada de 300, 600, 700, 800, bold, light.

| Papel | Tamanho | Line-height | Peso | Caixa | Tracking |
|---|---|---|---|---|---|
| display (wordmark/título do hero) | 51px (wordmark pode ser maior) | 0.9 | 500 | MAIÚSCULA | 0 |
| heading (afirmação de seção) | 41px | 0.9 | 500 | MAIÚSCULA | 0 |
| body (descrição) | 29px | 1.26 | **400** | **Mista** | 0 |
| heading-sm | 24px | 1.09 | 500 | MAIÚSCULA | 0 |
| subheading | 18px | 1.0 | 500 | MAIÚSCULA | 0 |
| UI (nav, links, botões) | 12–14px | ~1.0–1.2 | 500 | MAIÚSCULA | 0 |
| rótulo vertical / tags | 10–12px | 1.2 | 500 | MAIÚSCULA | 0 |
| legal | 8px Arial | 1.2 | 500 | MAIÚSCULA | 0 |

Tamanhos existentes na escala: **8, 10, 12, 14, 15, 18, 24, 29, 41, 51px.** Nenhum outro.

Regra de line-height: aperta conforme cresce. 1.2 em legenda → 1.0 em texto pequeno → 0.9 em display. **Nunca** suba o line-height do display para "dar respiro".

### 3.4 Espaçamento

Escala: **6, 8, 9, 10, 12, 14, 18, 24, 31, 41, 45, 68, 204px.**

| Uso | Valor |
|---|---|
| Gap padrão entre elementos | 18px |
| Padding de card | 24px |
| Margem do hero / gutter de página | 24px |
| Gutter entre objeto central e colunas de texto | 18px |
| Padding do botão preenchido | 14px 24px |
| Grandes respiros verticais | 68px / 204px |
| Altura de seção | 100vh |

Densidade: confortável. Em dúvida, use **mais** espaço negativo, nunca menos.

### 3.5 Raios (vocabulário completo)

| Elemento | Raio |
|---|---|
| Cards, overlays, thumbnails de vídeo | 12px |
| Botão preenchido (pílula) | 36px |
| Botão fantasma (contorno) | 22.5px |
| Círculos/indicadores | 9999px |
| Inputs, links, imagens full-bleed | 0px |

Não existem 4px, 6px, 8px, 16px, 24px de raio. Contêiner nunca abaixo de 12px.

### 3.6 Elevação

**Zero sombras.** Sem `box-shadow`, sem `drop-shadow`, sem `text-shadow`, sem glow, sem blur de fundo como efeito de profundidade. Profundidade = passo `#100904` → `#382416` + a própria imagem.

---

## 4. Componentes

Cada componente abaixo é a única forma aceita daquele elemento. Não crie variantes.

### 4.1 Botão preenchido (pílula) · ação principal
- Fundo `#382416`, texto `#ffedd7`, raio 36px, padding 14px 24px, 500, MAIÚSCULA, 8–14px.
- **No máximo um por seção** e, idealmente, um por página. A raridade é o sinal.

### 4.2 Botão fantasma (contorno) · ação secundária
- Fundo transparente, borda 1px `#ffedd7`, texto `#ffedd7`, raio 22.5px, padding vertical 7.5px, 500, MAIÚSCULA, 8–14px.
- A referência mede 0px de padding horizontal; como isso cola o texto na borda arredondada, use o padding horizontal mínimo da escala que deixe o texto fora da curva (12–18px) e trate como derivação.

### 4.3 Link de texto sublinhado · interação padrão
- Sem contêiner, sem padding, raio 0, texto `#ffedd7`, 500, MAIÚSCULA, 12–14px, indicado por sublinhado.
- Exceção: links de crédito/estúdio usam `#dc5000`.

### 4.4 Input (só linha inferior)
- Fundo transparente, raio 0, só `border-bottom: 1px solid #ffedd7`, texto creme, padding 1px 2px, padding-right 36px quando há ação embutida (ex.: seta de enviar).
- Sem caixa, sem fundo cinza, sem borda nos quatro lados.

### 4.5 Navegação fixa
- `position: fixed`, transparente, largura total.
- Esquerda: wordmark 12–14px. Direita: **no máximo 4 itens** a 12px, 500, MAIÚSCULA, creme.
- Item ativo: sublinhado **tracejado** de 1px.
- Sem fundo, sem blur, sem sombra, sem menu hambúrguer chamativo (no celular, ver 6.3).

### 4.6 Rótulo vertical lateral
- Texto girado 90°, 10–12px, MAIÚSCULA, creme, colado na margem direita. Nome + modelo/série do produto.

### 4.7 Wordmark
- Nome da marca, 500, MAIÚSCULA, line-height 0.9. Dois tamanhos: nav (12–14px) e hero (51px+). Sem símbolo.

### 4.8 Card de informação sobre o hero
- Raio 12px, fundo creme ou escuro com baixa opacidade, padding 24px, sem sombra.
- Conteúdo: título MAIÚSCULO curto + divisor tracejado + texto. Fica no canto inferior esquerdo do hero.

### 4.9 Seção de revelação do produto (assinatura do sistema)
- 100vh, fundo `#100904`.
- Grade de 3 colunas: **texto | objeto | texto**. Objeto central ocupa ~40% da largura.
- Coluna esquerda: afirmação 41px MAIÚSCULA, line-height 0.9, alinhada à esquerda.
- Coluna direita: descrição 29px, 400, caixa mista, line-height 1.26, **alinhada à esquerda dentro da coluna**.
- Gutter de 18px entre objeto e colunas.

### 4.10 Divisor tracejado
- `border-top: 1px dashed #40372e` (ou `#6c5f51` para secundário). Nunca sólido, nunca acima de 2px. Sempre com função estrutural, nunca enfeite.

### 4.11 Thumbnail de vídeo
- Card pequeno, raio 12px, canto inferior direito do hero, com mini-wordmark e ícone de play. Entrada secundária que não compete com a ação principal.

### 4.12 Texto legal
- Arial 8px, 500, MAIÚSCULA. A troca de fonte é proposital: "isto não é design, é compliance".

---

## 5. Layout

- **Full-bleed sempre.** Sem `max-width` de contêiner centralizado; toda seção ocupa 100vw.
- **Dois modos alternados:**
  1. **Hero fotográfico:** foto de cima, em contexto, tela cheia. Wordmark gigante no canto superior esquerdo com tagline (12px) acima dele; nav fixa no topo; rótulo vertical na direita; card de info no inferior esquerdo; thumbnail de vídeo no inferior direito.
  2. **Modo vazio (void):** fundo `#100904`, objeto centralizado, texto nos flancos.
- Transições entre seções: escuro sobre escuro, sem costura. A única quebra permitida é o divisor tracejado.
- **Proibido:** cards dentro de cards, sidebar, rodapé cheio de colunas, faixas de "logos de clientes", grades de 3 cards com ícone, seções com fundo de outra cor.
- Cada tela = uma afirmação.

---

## 6. Imagem e movimento

### 6.1 Fotografia
- Editorial, vista de cima, objeto em contexto com as ferramentas do ofício no quadro.
- Sem pessoas, sem lifestyle, sem banco de imagens.
- Full-bleed, **cantos retos** (sem máscara arredondada), alto contraste, gradação quente.

### 6.2 Render 3D / objeto isolado
- Objeto isolado sobre `#100904`, luz quente de cima à direita com rim light.
- Ângulo evolui entre seções (de cima → 3/4), dando sensação de giro.
- Se não houver render 3D, use foto recortada com fundo que se funda ao `#100904` (sem caixa, sem borda).

### 6.3 Responsivo (derivação: o original só descreve desktop)
- Desktop é canônico. No celular (< 768px):
  - a grade texto | objeto | texto empilha: **afirmação → objeto → descrição**, tudo alinhado à esquerda;
  - descrição desce de 29px para **24px** (passo existente da escala), mantendo peso 400 e caixa mista;
  - display e heading mantêm line-height 0.9; se precisar reduzir, use o passo anterior da escala (51 → 41, 41 → 24);
  - gutter lateral 18–24px; seções podem usar `min-height: 100svh` em vez de altura fixa;
  - nav: até 4 itens em uma linha de micro-tipo; se não couber, um único link de texto "MENU" (sublinhado), nunca ícone de hambúrguer colorido.
- Sem rolagem horizontal.

### 6.4 Movimento (derivação)
- Discreto e lento: fade e deslocamento curto do objeto/texto ao entrar na tela, troca de ângulo do objeto ao rolar.
- Sem bounce, sem parallax agressivo, sem elementos girando sem motivo. Respeitar `prefers-reduced-motion`.

---

## 7. Faça / Não faça

### Faça
- Todo texto de UI em `#ffedd7`.
- `#dc5000` só em créditos, "Built by" e link do estúdio/autor.
- Tudo MAIÚSCULO peso 500, exceto a descrição de 29px (400, caixa mista).
- Raios: 36 (pílula), 22.5 (fantasma), 12 (cards), 0 (inputs/links). Só esses.
- Seções de 100vh; nunca comprimir revelações em faixas.
- Divisores tracejados de 1px em `#40372e`.
- Objeto centralizado nas seções void, texto nos flancos com gutter de 18px.

### Não faça
- `#fff` em texto ou `#000` em fundo.
- `#dc5000` em botão, CTA ou superfície interativa.
- Título, nav ou rótulo em minúscula ou "Sentence case".
- Sombra em card, botão ou seção.
- Raio abaixo de 12px em contêiner.
- Mais de um botão preenchido por seção.
- Texto centralizado (títulos e descrições são sempre alinhados à esquerda, mesmo ao lado de imagem centralizada).

---

## 8. Anti-genérico: decisões que a IA NÃO pode tomar sozinha

Estas são as escolhas "automáticas" que destroem o sistema. Se você se pegar fazendo qualquer uma, pare e volte aos tokens.

| Reflexo genérico | Substituir por |
|---|---|
| Azul/roxo/verde como cor primária ou de link | Creme `#ffedd7` com sublinhado |
| Botão CTA colorido e grande | Pílula Bark Brown, uma só |
| `box-shadow` para "dar profundidade" | Passo de superfície ou nada |
| `rounded-md`, `rounded-lg` (6–8px) | 12px, 22.5px, 36px ou 0 |
| `font-bold`, `font-semibold` | 500 |
| Títulos em "Title Case" | MAIÚSCULA |
| `line-height: 1.2` no título "para respirar" | 0.9 |
| `letter-spacing: -0.02em` em display | 0 |
| `max-w-7xl mx-auto` | Full-bleed |
| Grade de 3 cards com ícone + título + texto | Seção void com uma afirmação |
| Gradiente de fundo, glassmorphism, glow | Fundo `#100904` liso |
| Ícones decorativos (Lucide, Heroicons) espalhados | Nenhum; texto faz o trabalho |
| Emoji, exclamação, "🚀 Comece agora!" | Frase declarativa curta |
| Foto de banco com pessoas sorrindo | Foto de cima do objeto com ferramentas |
| Seção alternada clara/escura | Escuro sobre escuro |
| Rodapé com 4 colunas de links | Crédito em micro-tipo + legal 8px |
| Texto centralizado no hero | Alinhado à esquerda |
| Divisor `<hr>` sólido cinza | 1px tracejado `#40372e` |
| Input com caixa e fundo cinza | Só linha inferior creme |
| Cinza neutro (`#888`, `slate-500`) | Driftwood `#6c5f51` (só estrutura) |

---

## 9. Protocolo para o que o documento não cobre

Quando surgir algo sem regra (estado de erro, hover, foco, tabela, formulário longo, modal, etc.):

1. **Procure analogia** no próprio sistema: qual componente existente tem o mesmo papel? Reaproveite-o.
2. **Derive só de tokens existentes.** Nunca crie cor, tamanho ou raio novo.
3. **Prefira linha a preenchimento** (P7) e **menos a mais** (P3).
4. **Declare a derivação** ao usuário em uma linha ("hover do botão fantasma: derivado, fundo Bark Brown").

Derivações já resolvidas (use estas, não reinvente):

| Situação | Solução |
|---|---|
| Hover de link | Sublinhado mais espesso ou mudança de `text-underline-offset`; cor continua creme |
| Hover do botão fantasma | Fundo `#382416` |
| Hover do botão preenchido | Borda 1px `#ffedd7` aparece (sem mudar a cor de fundo para algo novo) |
| Foco (teclado) | `outline: 1px dashed #ffedd7; outline-offset: 4px` (obrigatório, acessibilidade) |
| Erro de formulário | Linha inferior do input continua creme; mensagem 12px MAIÚSCULA creme abaixo, prefixada por "* " (como as notas legais). Não use vermelho nem o laranja |
| Desabilitado | Opacidade 0.4 no próprio elemento |
| Modal / overlay | Fundo `#100904` com opacidade, card raio 12px, borda 1px `#40372e`, padding 24px, sem sombra |
| Tabela | Sem fundo; linhas separadas por 1px tracejado `#40372e`; cabeçalho 12px MAIÚSCULA |
| Seleção de texto | Fundo `#382416`, texto creme |
| Barra de rolagem | Trilho `#100904`, polegar `#40372e` |
| Ícone indispensável | SVG de traço fino em creme (ou `#000` só se for vetor decorativo sobre área clara da foto) |

---

## 10. Checklist de validação

Marque cada item antes de entregar. **[B] = bloqueante.**

### Cor
- [ ] [B] Nenhum `#fff`, `white`, `#000` ou `black` em texto/fundo (busque no código).
- [ ] [B] Fundo de todas as seções é `#100904`.
- [ ] [B] `#dc5000` aparece **somente** em créditos/link do estúdio; zero ocorrências em botões, hovers, bordas ou fundos.
- [ ] [B] Nenhuma cor fora das 7 do token (busque por `#` e `rgb(` no CSS).
- [ ] Driftwood não é usado em texto de leitura.

### Tipografia
- [ ] [B] Uma família (Halyard ou substituto com `ss01`) + Arial só no legal 8px.
- [ ] [B] Só pesos 400 e 500.
- [ ] [B] Todo título, nav, rótulo, botão e link em MAIÚSCULA.
- [ ] [B] Caixa mista e peso 400 só na descrição (29px; 24px no celular).
- [ ] [B] Display e heading com line-height 0.9.
- [ ] Letter-spacing 0 em tudo.
- [ ] Todos os tamanhos pertencem à escala 8/10/12/14/15/18/24/29/41/51 (wordmark do hero pode exceder 51).
- [ ] [B] Nenhum texto centralizado.

### Forma e profundidade
- [ ] [B] Zero `box-shadow`, `drop-shadow`, `text-shadow`.
- [ ] [B] Raios só entre 0, 12, 22.5, 36, 9999px; contêineres ≥ 12px.
- [ ] Imagens full-bleed com cantos retos.
- [ ] Divisores são tracejados, 1px, `#40372e`/`#6c5f51`.
- [ ] Inputs só com linha inferior.

### Componentes e hierarquia
- [ ] [B] No máximo um botão preenchido por seção.
- [ ] Nenhuma cor de CTA inventada.
- [ ] Nav fixa, transparente, ≤ 4 itens, ativo com sublinhado tracejado.
- [ ] Wordmark só tipográfico.
- [ ] Rótulo vertical com nome + modelo presente no hero.

### Layout
- [ ] [B] Full-bleed: nenhum contêiner com `max-width` centralizado.
- [ ] Seções de 100vh (ou `100svh` no celular), uma afirmação por tela.
- [ ] Hero fotográfico seguido de seções void alternadas.
- [ ] Seção void em 3 colunas texto | objeto | texto, gutter 18px.
- [ ] [B] Sem cards dentro de cards, sem sidebar, sem rodapé de colunas.
- [ ] Espaçamentos pertencem à escala (6…204px).

### Imagem
- [ ] Foto do hero de cima, com ferramentas do ofício, sem pessoas, gradação quente.
- [ ] Objeto isolado nas seções void, luz quente de cima à direita.
- [ ] Cor do contexto da foto não virou token de UI.

### Conteúdo e voz
- [ ] Afirmações curtas, declarativas, com ponto final, sem exclamação/emoji.
- [ ] Descrição em 1–3 frases.

### Acessibilidade e técnica
- [ ] [B] Foco visível em todo elemento interativo (tracejado creme).
- [ ] [B] Sem rolagem horizontal em 360px de largura.
- [ ] `prefers-reduced-motion` respeitado.
- [ ] Imagens com `alt` descritivo.
- [ ] Toda derivação foi declarada ao usuário.

Auditoria rápida no terminal (ajuste o caminho):

```bash
grep -rniE '#fff\b|#ffffff|white|#000\b|black|box-shadow|drop-shadow|text-shadow|font-weight:\s*(300|600|700|800|bold)|text-align:\s*center|max-width' ./src
```

Cada ocorrência precisa de justificativa (ex.: `#000` em `fill` de SVG decorativo é permitido).

---

## 11. Base pronta (copiar no início de todo projeto)

### 11.1 Fonte

Com Adobe Fonts (Halyard): use o kit do cliente. Sem ele, Inter:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap" rel="stylesheet">
```

### 11.2 CSS

```css
:root {
  /* Cores */
  --color-warm-cream: #ffedd7;
  --color-walnut-shadow: #100904;
  --color-bark-brown: #382416;
  --color-cork-border: #40372e;
  --color-driftwood: #6c5f51;
  --color-ember-accent: #dc5000;
  --color-pure-black: #000000;

  /* Fontes */
  --font-display: 'halyard-display-variable', 'Inter', 'Söhne', 'Neue Haas Grotesk', ui-sans-serif, system-ui, sans-serif;
  --font-legal: Arial, system-ui, sans-serif;

  /* Escala tipográfica */
  --text-subheading: 18px; --leading-subheading: 1;
  --text-heading-sm: 24px; --leading-heading-sm: 1.09;
  --text-body: 29px;       --leading-body: 1.26;
  --text-heading: 41px;    --leading-heading: 0.9;
  --text-display: 51px;    --leading-display: 0.9;
  --font-weight-regular: 400;
  --font-weight-medium: 500;

  /* Espaçamento */
  --spacing-6: 6px;  --spacing-8: 8px;   --spacing-9: 9px;   --spacing-10: 10px;
  --spacing-12: 12px; --spacing-14: 14px; --spacing-18: 18px; --spacing-24: 24px;
  --spacing-31: 31px; --spacing-41: 41px; --spacing-45: 45px; --spacing-68: 68px;
  --spacing-204: 204px;
  --card-padding: 24px;
  --element-gap: 18px;

  /* Raios */
  --radius-cards: 12px;
  --radius-inputs: 0px;
  --radius-buttons-outlined: 22.5px;
  --radius-buttons-pill: 36px;
  --radius-full-round: 9999px;
}

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  background: var(--color-walnut-shadow);
  color: var(--color-warm-cream);
  font-family: var(--font-display);
  font-weight: var(--font-weight-medium);
  font-feature-settings: "ss01" on;
  letter-spacing: 0;
  text-transform: uppercase;
  text-align: left;
  -webkit-font-smoothing: antialiased;
}

::selection { background: var(--color-bark-brown); color: var(--color-warm-cream); }

:focus-visible {
  outline: 1px dashed var(--color-warm-cream);
  outline-offset: 4px;
}

/* Vozes tipográficas */
.display  { font-size: var(--text-display); line-height: var(--leading-display); }
.heading  { font-size: var(--text-heading); line-height: var(--leading-heading); }
.heading-sm { font-size: var(--text-heading-sm); line-height: var(--leading-heading-sm); }
.subheading { font-size: var(--text-subheading); line-height: var(--leading-subheading); }
.ui       { font-size: 12px; line-height: 1.2; }
.body {
  font-size: var(--text-body);
  line-height: var(--leading-body);
  font-weight: var(--font-weight-regular);
  text-transform: none;             /* a única voz em caixa mista */
}
.credit   { color: var(--color-ember-accent); font-size: 12px; }
.legal    { font-family: var(--font-legal); font-size: 8px; line-height: 1.2; }

/* Componentes */
.btn-pill {
  display: inline-block;
  background: var(--color-bark-brown);
  color: var(--color-warm-cream);
  border: 1px solid transparent;
  border-radius: var(--radius-buttons-pill);
  padding: 14px 24px;
  font: inherit; font-size: 12px; text-transform: uppercase;
  text-decoration: none; cursor: pointer;
}
.btn-pill:hover { border-color: var(--color-warm-cream); }

.btn-ghost {
  display: inline-block;
  background: transparent;
  color: var(--color-warm-cream);
  border: 1px solid var(--color-warm-cream);
  border-radius: var(--radius-buttons-outlined);
  padding: 7.5px 18px;               /* horizontal derivado, ver 4.2 */
  font: inherit; font-size: 12px; text-transform: uppercase;
  text-decoration: none; cursor: pointer;
}
.btn-ghost:hover { background: var(--color-bark-brown); }

.link {
  color: var(--color-warm-cream);
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
}
.link:hover { text-decoration-thickness: 2px; }

.input {
  background: transparent;
  color: var(--color-warm-cream);
  border: 0;
  border-bottom: 1px solid var(--color-warm-cream);
  border-radius: var(--radius-inputs);
  padding: 1px 36px 1px 2px;
  font: inherit; font-size: 14px; text-transform: uppercase;
}

.divider { border: 0; border-top: 1px dashed var(--color-cork-border); margin: 0; }

.card {
  border-radius: var(--radius-cards);
  padding: var(--card-padding);
  border: 1px solid var(--color-cork-border);
}

/* Navegação */
.nav {
  position: fixed; inset: 0 0 auto 0; z-index: 10;
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--spacing-24);
  background: transparent;
  font-size: 12px;
}
.nav a { color: var(--color-warm-cream); text-decoration: none; margin-left: var(--spacing-18); }
.nav a[aria-current="page"] { border-bottom: 1px dashed var(--color-warm-cream); }

.side-label {
  position: fixed; right: var(--spacing-12); top: 50%;
  transform: translateY(-50%) rotate(90deg);
  transform-origin: right center;
  font-size: 10px; white-space: nowrap;
}

/* Seções */
.section { min-height: 100vh; width: 100%; position: relative; }
.hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 0; }

.reveal {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 40% 1fr;
  gap: var(--spacing-18);
  align-items: center;
  padding: 0 var(--spacing-24);
  background: var(--color-walnut-shadow);
}
.reveal__object { width: 100%; height: auto; display: block; }

@media (max-width: 767px) {
  .reveal { grid-template-columns: 1fr; min-height: 100svh; padding: var(--spacing-68) var(--spacing-18); }
  .body { font-size: var(--text-heading-sm); }
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
```

### 11.3 Estrutura HTML de referência

```html
<nav class="nav">
  <a href="#" class="ui">MARCA</a>
  <div>
    <a href="#intro" aria-current="page">INTRO</a>
    <a href="#recursos">RECURSOS</a>
    <a href="#produto">PRODUTO</a>
    <a href="#contato">CONTATO</a>
  </div>
</nav>
<span class="side-label">MARCA 1-MODELO</span>

<header class="section">
  <img class="hero-img" src="hero-vista-de-cima.jpg" alt="Produto visto de cima sobre a bancada, ao lado das ferramentas usadas para fazê-lo">
  <!-- tagline 12px acima do wordmark gigante, canto superior esquerdo -->
  <!-- card de info no inferior esquerdo, thumbnail de vídeo no inferior direito -->
</header>

<section class="reveal">
  <h2 class="heading">NÃO É SÓ UM OBJETO.</h2>
  <img class="reveal__object" src="render.png" alt="Produto isolado, visto em 3/4">
  <p class="body">Feito para durar e para ser usado todo dia. Uma frase que explica o produto em caixa mista.</p>
</section>

<hr class="divider">

<footer>
  <p class="ui">DESENHADO POR <a class="credit" href="#">ESTÚDIO</a></p>
  <p class="legal">* NOTA LEGAL</p>
</footer>
```

### 11.4 Tailwind v4 (se o projeto usar Tailwind)

```css
@theme {
  --color-warm-cream: #ffedd7;
  --color-walnut-shadow: #100904;
  --color-bark-brown: #382416;
  --color-cork-border: #40372e;
  --color-driftwood: #6c5f51;
  --color-ember-accent: #dc5000;
  --color-pure-black: #000000;

  --font-display: 'halyard-display-variable', 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-legal: Arial, system-ui, sans-serif;

  --text-subheading: 18px; --text-subheading--line-height: 1;
  --text-heading-sm: 24px; --text-heading-sm--line-height: 1.09;
  --text-body: 29px;       --text-body--line-height: 1.26;
  --text-heading: 41px;    --text-heading--line-height: 0.9;
  --text-display: 51px;    --text-display--line-height: 0.9;

  --radius-card: 12px;
  --radius-ghost: 22.5px;
  --radius-pill: 36px;

  --shadow-*: initial;   /* remove todas as sombras do tema */
}
```

Com Tailwind, **não** use as cores, raios e sombras padrão (`blue-500`, `rounded-lg`, `shadow-md`, `font-bold`). Só as classes geradas pelos tokens acima.

---

## 12. Prompts-modelo de componentes

Use como ponto de partida ao gerar cada parte:

1. **Hero:** canvas full-bleed `#100904` com foto de cima do produto em contexto. Wordmark da marca a 51px+, 500, MAIÚSCULA, line-height 0.9, `#ffedd7`, canto superior esquerdo com margem de 24px. Tagline de 12px, 500, MAIÚSCULA acima do wordmark.
2. **Ação principal:** não existe cor de CTA. Use a pílula Bark Brown, uma vez.
3. **Botão fantasma:** transparente, borda 1px creme, raio 22.5px, padding vertical 7.5px, texto 12px 500 MAIÚSCULA.
4. **Revelação do produto:** 100vh, `#100904`, render no centro ocupando 40% da largura. Esquerda: afirmação 41px MAIÚSCULA line-height 0.9. Direita: descrição 29px, 400, caixa mista, line-height 1.26, alinhada à esquerda. Gutter de 18px.
5. **Navegação:** fixa, transparente, largura total. Wordmark 12px à esquerda; quatro itens 12px MAIÚSCULA à direita; ativo com sublinhado tracejado de 1px.

---

## 13. Referências de repertório

Para calibrar o nível de refinamento (não copiar): Lusion, Active Theory, Resn, Tool of North America, Buck. Em comum: canvas escuro e quente, um objeto único dominando a tela, interface mínima, tipografia que recua para o objeto falar.
