---
name: ui-design
description: Processo, regras visuais e auditoria para desenhar telas do One (protótipo no Claude Design ou código em apps/web). Use SEMPRE antes de criar ou mudar qualquer tela, layout, componente visual, menu, formulário ou tabela, e ao revisar telas existentes.
---

# Design de telas do One

O One é ferramenta de trabalho: a equipe passa o dia nele distribuindo exames, fechando competência e conferindo repasse. O critério é **familiaridade conquistada**: a ferramenta some na tarefa. Estranheza sem propósito é o erro mais comum; decoração é o segundo.

As decisões já tomadas (tokens, direção visual, padrões de navegação) estão em [sistema.md](sistema.md). Leia antes de desenhar e siga. Mudou uma decisão com o usuário? Atualize o `sistema.md` no mesmo passo.

Como a tela reage (validação, estado na URL, erros por código HTTP, textos de erro e vazio, desfazer, teclado, tempo do skeleton) está em [comportamento.md](comportamento.md). Leia antes de codar qualquer tela com formulário, lista ou ação.

## Processo (não pule etapas)

1. **Contexto real.** Abra a tela equivalente no legado (`../dashboards-one/src/app/(dashboard)/…` e `src/components/…`) e anote o que ela faz, os dados, as ações e as permissões (`src/lib/permissoes.ts`). Leia `docs/redesenho-banco.md` para o que muda no modelo. Nunca desenhe só de memória.
2. **Brief da tela**, em poucas linhas, antes de qualquer pixel:
   - Quem usa (papel) e com que frequência (várias vezes por hora? uma vez por mês?).
   - O verbo principal (ex.: "aprovar a rodada", "achar um usuário e trocar o papel").
   - Os dados e o volume (quantas linhas, paginação, filtros).
   - Os estados: vazio, carregando, erro, sem permissão, sucesso.
   - O que é sensível (LGPD, financeiro, ação irreversível).
   - Onde cada interação acontece (no lugar, popover, painel, diálogo, aba, página...) e por quê; ver "Onde cada interação acontece" abaixo.
3. **Direção.** Se o `sistema.md` ainda não tem a direção visual, proponha 2–3 direções de verdade diferentes (eixo nomeável: "denso claro" × "marca escura"…), com prévia low-fi, e espere o usuário escolher. Depois grave a escolha no `sistema.md`. Com direção gravada, não reabra a discussão.
4. **Checkpoint por tela** (escreva para si antes de montar): hierarquia (o que se vê primeiro, segundo, terceiro), densidade (px de linha e padding), superfícies, o que é ação primária, e o que você está deliberadamente **não** colocando.
5. **Construir** seguindo as regras abaixo, o `sistema.md` e o `comportamento.md`.
6. **Auditar** com a checklist do fim antes de entregar. Corrija o que falhar; não entregue com "melhorias futuras" que caberiam agora.

## Regras de produto do One (fixas)

- **Menu lateral só com telas de trabalho.** Subtelas viram abas dentro da tela; configurações ficam numa central própria, com submenu. Item que o papel não permite não aparece (nunca aparece desabilitado).
- **Campo obrigatório leva `*`** no rótulo (cor de erro, `aria-hidden`) + `required`. Formulário com campos opcionais leva a legenda "* Campo obrigatório".
- **Ícones: Phosphor**, peso regular, um só conjunto. 20px no menu, 16–18px em botões e linhas. Ícone sozinho só em ação óbvia e sempre com `aria-label`; no resto, ícone + texto. Nunca emoji nem caractere Unicode como ícone.
- **Texto em pt-BR**, frase com inicial maiúscula (sentence case), sem caixa alta em rótulos. Botão diz a ação ("Enviar convite", não "Confirmar"); a mesma ação mantém o nome no fluxo inteiro (botão "Desativar" → aviso "Usuário desativado").
- **Toda lista que pode passar de ~10 itens é paginada**, com o total ("1–10 de 26"), inclusive as que ficam dentro de uma seção ou de um painel (sessões abertas, acessos, histórico). Nunca uma lista que cresce sem fim na tela. Dado sem limite: paginação pela API. Lista curta e limitada que a API já devolve inteira: paginação no navegador, 10 por página numa página e 5 num painel lateral.
- **Dado de paciente** só em tela que precisa e para quem tem permissão; CPF mascarado por padrão.
- **Ação destrutiva ou irreversível** (fechar competência, desativar, excluir papel) pede confirmação que diz a consequência ("6 usuários perdem o acesso"). Ação comum não pede confirmação; se é reversível, o toast oferece "Desfazer" (ver `comportamento.md`).
- **Sem texto de marketing** dentro do sistema (nem no login): nada de slogan, "tudo em um só lugar", números de vaidade.

## Regras visuais (modo operação)

**Tipografia**
- Uma família para a interface; monoespaçada só para código e chaves técnicas (ex.: `faturamento.competencia.fechar`), nunca como enfeite.
- Escala fixa (não fluida), razão ~1,2 sobre base 14px: 12 · 13 · 14 · 16 · 18 · 22 · 28. Corpo da interface 14px; título de página 22–24px; nada acima de 28px dentro do app.
- Hierarquia por peso e cor antes de tamanho. Pesos: 400, 500, 600 (700 só no título de página, se a direção pedir).
- `font-variant-numeric: tabular-nums` em todo número que muda (tabelas, valores, datas, contadores).
- Mais espaço acima de um título do que abaixo dele.

**Espaçamento e densidade**
- Base 4px: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48. Nada fora da escala.
- Densidade casa com a frequência de uso: telas usadas o dia inteiro são densas. Linha de tabela 40–44px; padding de painel 16px (20–24px só em formulários curtos); controles com 36px de altura (40px nos formulários de acesso).
- Agrupe por proximidade antes de criar caixa. Uma caixa só existe se separa algo que o espaço não separa.

**Superfícies e profundidade**
- **Uma estratégia de profundidade: bordas de 1px.** Sombra só no que flutua (menu suspenso, popover, modal, toast). Nunca borda + sombra no mesmo elemento.
- Raio: 6px em controles, 8px em painéis e tabelas, 12px em modal. Pílula só para status pequenos.
- **Raios concêntricos:** peça encostada na borda de outra arredondada usa raio interno = raio de fora − distância entre elas (com padding 0, raio de fora − borda). Nunca canto reto ou raio maior dentro de canto arredondado.
- Proibido card dentro de card. Proibido grade de cards iguais (ícone + título + texto) como estrutura de página: prefira lista com divisórias.

**Cor**
- Neutros + **um** acento (a cor da marca). O acento aparece só em ação primária, item selecionado, foco e link. Tudo o mais é neutro.
- Cores de estado com papel fixo: sucesso, atenção, erro, informação. Cada uma com fundo claro + texto escuro da mesma matiz, sempre com rótulo escrito; cor nunca é o único sinal (diferenciar também por ícone ou texto).
- Contraste: texto 4,5:1 (inclusive cinza de legenda e placeholder), texto ≥24px 3:1, ícones, bordas de controle e anel de foco 3:1.
- Em código: só tokens semânticos (`bg-card`, `text-muted-foreground`, `border-border`). Cor nova vira token em `:root` e `.dark` (ver `apps/web/CLAUDE.md`).

**Navegação**
- Menu lateral: 240px aberto, 64px recolhido (só ícones, com o nome em `title`/tooltip); itens de 36–40px; grupos com rótulo em sentence case 12px, cor discreta, sem caixa alta.
- Item ativo: fundo sutil + texto em peso 500/600 + ícone na cor do acento. Não usar barra colorida grossa na lateral do item.
- Título da página com o caminho só quando há hierarquia real (Configurações › Usuários).

**Tabelas**
- Cabeçalho 12–13px, peso 500, cor secundária, sentence case. Texto à esquerda, números à direita, datas em formato curto (`12/11 22:31`, `Hoje, 09:12`).
- Sem zebra; divisória de 1px entre linhas; hover sutil; linha selecionada com fundo do acento bem claro.
- Ações da linha: a linha inteira abre o detalhe (clique em qualquer coluna, com cursor de mãozinha; o nome é um `<Link>` com o `?id=` do painel, que o teclado alcança e o Ctrl/⌘+clique abre em outra aba); ações raras num menu "⋯" (ícone `DotsThree`). No máximo uma ação visível por linha.
- Filtros acima da tabela, na mesma faixa da busca; contagem e paginação no rodapé.
- Com o painel lateral aberto, a lista só perde coluna que não cabe: mede a largura e tira, na ordem, primeiro as secundárias escolhidas pela tela e depois as outras da direita para a esquerda; o nome nunca sai. Com espaço sobrando, todas ficam.
- Lista que é o trabalho principal da tela cabe na altura da janela no computador: a tabela rola por dentro, com o cabeçalho fixo, e o rodapé com contagem e paginação fica sempre à vista; a página em si não rola. No celular, a página rola normalmente.

**Formulários**
- **Campo de formato fixo tem máscara** (CPF, CNPJ, CEP, telefone, chave Pix desses tipos): formata enquanto a pessoa digita, sem pular o cursor, com teclado numérico no celular.
- Rótulo acima do campo, ajuda abaixo, erro abaixo (texto que diz o problema e como resolver). Largura de leitura: 480–640px.
- Seleção com mais de 7 opções abre com um campo de busca no topo da lista, com o foco nele: a pessoa digita parte do nome (sem acento nem maiúscula) em vez de rolar. Lista curta (situação, tipo) fica sem busca.
- Um botão primário por formulário, à direita no rodapé (ou largura total em formulários estreitos de acesso); "Cancelar" secundário ao lado.
- Validação, envio, alterações não salvas e erro do servidor: `comportamento.md`.

**Gráficos** (painéis do `analytics`)
- Escolha pela pergunta: evolução no tempo → linha ou coluna; comparação entre itens → barra horizontal ordenada; parte do todo → barra empilhada. Pizza ou rosca só com até 5 fatias; mais que isso vira barra.
- O gráfico diz a granularidade (dia, semana, mês, competência) e, quando faz sentido, deixa trocar. Eixos e rótulos com números e datas em pt-BR (`Intl`), volume sempre como soma.
- Legenda junto do gráfico (ou rótulo direto na linha); dica com o valor exato ao passar o mouse e ao focar pelo teclado. Cor nunca é o único sinal: rótulo, padrão ou ordem também distinguem.
- Séries com matizes bem separados e pouco saturados (a paleta categórica do `sistema.md`); a série principal pode usar o acento, as de comparação ficam neutras. Linhas de grade bem claras; marcas com contraste 3:1, texto 4,5:1.
- Estados iguais aos das tabelas: skeleton com o formato do gráfico, vazio que diz por quê (sem dados no período, filtro), erro com "Tentar de novo".
- Todo gráfico tem como ver os números: tabela abaixo, aba "Tabela" ou exportação.
- Sem animação de entrada do gráfico.

**Onde cada interação acontece**

Nem toda funcionalidade é uma tela nova. Antes de desenhar, pondere onde a interação cabe melhor e escreva a escolha (e o porquê) no brief da tela. As opções abaixo são exemplos, não uma lista fechada: se outro padrão resolver melhor (passo a passo, edição em massa, arrastar e soltar, linha que expande...), use-o.

Perguntas para decidir:

- **Quanto contexto a pessoa precisa manter à vista?** Se ela compara com a lista ou volta a ela em seguida, não tire a lista da tela (edição na linha, painel lateral, linha que expande).
- **Qual o tamanho da tarefa?** Um campo ou um clique resolve no lugar; um formulário curto cabe num painel ou diálogo; um fluxo longo, com várias seções ou etapas, pede página.
- **Precisa de endereço próprio?** Se alguém vai mandar o link, voltar pelo histórico, recarregar ou abrir em outra aba, o estado vai para a URL (rota ou parâmetro de busca, como o `?id=` de um painel).
- **É para interromper?** Modal só quando bloquear o resto é o objetivo: confirmação destrutiva, decisão obrigatória antes de seguir, tarefa curta que não faz sentido fazer pela metade.
- **Com que frequência e em que ritmo?** Ação feita dezenas de vezes por dia não pode custar abrir e fechar camadas; prefira o caminho mais curto (na linha, atalho, ação em massa).
- **Como fica no celular (390px)?** Painel lateral vira tela cheia ou gaveta de baixo; tabela larga rola dentro da caixa; popover pequeno pode virar folha inferior.

Exemplos de quando cada um costuma servir:

| Padrão | Costuma servir para | Evite quando |
| --- | --- | --- |
| No lugar (edição na linha, alternar, campo que salva sozinho) | Ajuste rápido e frequente de um valor | A mudança tem consequência que precisa de explicação |
| Popover / menu suspenso | Ação rara de um item (menu "⋯"), filtro, escolha curta | O conteúdo tem formulário ou passa de poucas linhas |
| Painel lateral (drawer) | Ver ou editar um item sem perder a lista; convite, detalhe | A tarefa é longa ou é o trabalho principal da tela |
| Diálogo (modal) | Confirmar ação destrutiva, decisão que bloqueia, tarefa curta e atômica | É só para mostrar detalhe, ou o conteúdo tem rolagem longa |
| Linha que expande / acordeão | Detalhe secundário de itens de uma lista | O detalhe tem ações ou formulário próprios |
| Aba | Subtelas do mesmo assunto (ex.: Volumetria › Mensal) | As partes são independentes e mereciam item no menu |
| Página / rota nova | Trabalho principal, fluxo longo, conteúdo que merece link | Um painel ou a própria lista resolveriam sem trocar de contexto |
| Toast / aviso no fluxo | Confirmar que algo foi feito; aviso no fluxo para erro que exige ação | A mensagem é a única fonte de informação essencial |

O visual de cada padrão segue as regras desta skill (sombra só no que flutua, raio de 12px no modal, foco preso em diálogo e gaveta via Base UI).

**Estados**
- Todo controle: padrão, hover, foco visível (anel de 2px na cor do acento), ativo, desabilitado.
- **Cursor diz o que dá para fazer:** tudo que se clica (botão, link, aba, opção, linha que abre, caixa de marcar) mostra a mãozinha; campo de texto mostra o cursor de texto; desabilitado mostra o proibido. Nunca seta em algo clicável.
- Todo bloco de dados: carregando (skeleton com o formato do conteúdo, não spinner no meio), vazio (diz o que fazer e oferece a ação), erro (o que houve + como tentar de novo), sem permissão.
- Sucesso de uma ação (salvou, encerrou, enviou) vira toast no canto inferior direito, que some sozinho em 5 s e fecha pelo X; nunca uma mensagem de sucesso dentro do componente, que empurra a tela. Erro que pede ação continua no fluxo, junto do que falhou.
- **Nunca deixar a pessoa sem resposta.** Todo clique e toda espera mostram algo em até ~100ms; nada de tela, painel ou área em branco (`return null` enquanto carrega) nem de clique que parece não ter feito nada.
  - Carregando dados (página, painel, aba, lista, gráfico): **skeleton** com o formato do conteúdo que vem (linhas da tabela, campos do formulário, título do painel), na mesma posição e tamanho, para nada pular quando os dados chegam. O que já se sabe aparece na hora (título, abas, botão de fechar); só o que falta vira skeleton.
  - Recarregando o que já está na tela (filtro, página seguinte, atualização automática): mantém os dados antigos à vista, esmaecidos ou com indicador discreto, em vez de trocar por skeleton.
  - Ação em andamento (salvar, enviar, excluir): o botão fica desabilitado e diz que está trabalhando ("Salvando…"); terminou, confirma ("Dados salvos.") ou explica o erro.
  - Espera longa (importação, fechamento, geração de arquivo): progresso ou etapa atual, e a pessoa pode seguir usando o resto da tela.
  - Spinner solto no meio da tela só onde não há formato a imitar (ex.: a troca de rota inteira antes de saber o que vem).

**Movimento**
- Leve animação em tudo que abre e fecha por cima da tela (painel lateral, gaveta, modal, lista suspensa, dica): 150–200ms, ease-out, só opacidade e posição/escala (`opacity`, `transform`, `translate`, `scale`), só para mostrar mudança de estado (abrir, expandir, confirmar). Valores por peça na seção "Movimento" do `sistema.md`.
- Nada de animação de entrada da página nem de conteúdo. Respeitar `prefers-reduced-motion` (`motion-reduce:transition-none`).

## Anti-padrões (recuse)

- Rótulo em caixa alta com espaçamento largo acima de títulos ("eyebrow"); rótulos de seção em caixa alta.
- Grade de cards iguais como estrutura; card dentro de card; o mesmo raio em tudo.
- Bloco de "métrica herói" (número grande + rótulo pequeno + gradiente) sem necessidade real.
- Gradiente, vidro/desfoque, sombra dramática ou borda grossa como enfeite; borda colorida lateral em cards ou alertas.
- Mais de um acento; cor diferente por seção; cor forte em estado inativo.
- Frases de marketing, slogans, números inventados, texto de preenchimento.
- Strings de metadados unidas por "·" em todo lugar; "→" pendurado em botões; numeração 01/02/03 sem sequência real.
- Modal como primeira opção; tooltips para informação essencial.
- Área em branco ou spinner no meio enquanto carrega, quando dá para mostrar o skeleton do conteúdo; clique sem resposta visível.
- Ícones de conjuntos misturados, emoji, ícone decorativo sem função.
- Componente reinventado (barra de rolagem, select, checkbox feitos à mão) quando há nativo ou Base UI.
- Enfeite nativo do navegador fora do sistema (o "x" azul do campo de busca, setas do campo numérico): esconda e use o ícone Phosphor, com cursor de clique.
- Telas do mesmo tipo com padrões diferentes (cada lista com um jeito de filtrar, cada formulário com um jeito de salvar).

## Auditoria (antes de entregar)

1. **Teste do apertar de olhos:** borrando a tela, dá para ver o que é principal, secundário e terciário? A ação primária é óbvia?
2. **Teste da troca:** se trocasse o logo, a tela serviria a qualquer sistema? Se sim, faltou contexto do domínio (termos, dados e fluxo reais do One).
3. **Escalas:** todos os tamanhos de fonte, espaçamentos e raios estão nas escalas acima?
4. **Profundidade:** só bordas no conteúdo; sombra só no que flutua?
5. **Cor:** o acento aparece só em ação, seleção, foco e link? Status têm rótulo além da cor? Contrastes passam (cinza de legenda incluso)?
6. **Estados:** vazio, carregando (skeleton com o formato do conteúdo), erro, sem permissão e foco desenhados ou previstos? Algum clique ou espera fica sem resposta visível?
7. **Regras do One:** `*` nos obrigatórios, Phosphor em tudo, pt-BR sentence case, sem caixa alta, paginação com total, confirmação só no destrutivo.
8. **Anti-padrões:** passe a lista acima item por item.
9. **Onde cada interação acontece:** cada ação está no padrão que o brief escolheu? Nada virou tela nova, modal ou painel por hábito?
10. **Celular:** a tela funciona em 390px (menu vira gaveta, tabela rola dentro da caixa, filtros quebram linha)? Os campos têm texto de 16px no celular (sem zoom do iOS ao focar)?
11. **Comportamento:** passe o `comportamento.md` item por item (validação, URL, erros por código, textos, desfazer, teclado, tempo do skeleton).
12. **Só teclado e zoom:** faça o verbo principal da tela só com o teclado, e confira a tela com zoom de 200% no navegador. Nada some, nada fica coberto, nada exige mouse.
13. **Dados extremos:** nome longo, número grande, lista vazia e cheia, cliques repetidos, rede lenta e API fora (lista no `comportamento.md`).
14. **Custo do verbo principal:** conte os cliques e as trocas de contexto para fazer a tarefa principal. Dá para tirar algum (no lugar, atalho, valor padrão, ação em massa)?
15. **Pelos olhos de quem usa:** percorra a tela como 2–3 papéis reais (ex.: coordenador de especialidade, financeiro, operação) com a tarefa deles. Anote onde cada um trava.

**Severidade** de cada problema achado, para decidir o que corrigir antes de entregar:

| Nível | Quando | O que fazer |
| --- | --- | --- |
| P0 | Impede a tarefa, perde dado ou mostra estado errado | Corrigir antes de entregar |
| P1 | Dificulta muito, viola acessibilidade AA, ou a pessoa ligaria para o suporte | Corrigir antes de entregar |
| P2 | Incomoda, mas tem caminho | Corrigir se couber no passo; senão, listar no resumo |
| P3 | Acabamento | Listar no resumo |

Teste da severidade: "a pessoa ligaria para o suporte por causa disso?" Se sim, é no mínimo P1.

## Onde desenhar

- **Protótipo (Claude Design):** siga o tipo Design; cada tela é um artboard `.dc.html` com raiz fluida (`expand: "fill"`). Ícones Phosphor como `<svg viewBox="0 0 256 256" fill="currentColor"><path d="…"/></svg>`, peso regular; os paths saem de `@phosphor-icons/react` (`dist/defs/<Nome>.es.js`, entrada `"regular"`). Tokens do `sistema.md` no lugar de cores soltas, repetidos igual em todas as telas.
- **Base UI sempre:** antes de montar qualquer peça (botão, campo, drawer, diálogo, select, abas, tooltip, avatar, progresso…), confira se o Base UI tem; se tem, use o dele, nunca uma imitação com HTML. HTML puro só onde não há equivalente (`<ul>`, `<nav>` simples).
- **Código (apps/web):** Tailwind + tokens semânticos, Base UI para componentes interativos, `useAppForm` para formulários, `DataTable` para tabelas (ver `apps/web/CLAUDE.md` e a skill `react-component`). O pacote `@phosphor-icons/react` entra pela skill `add-dependency` quando a primeira tela for codada.
