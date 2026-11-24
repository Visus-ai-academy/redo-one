# Sistema visual do One

Decisões aprovadas pelo usuário. Só mudam por pedido explícito; ao mudar, atualize aqui no mesmo passo.

## Direção visual: "Claro e denso, menu verde" (aprovada em 13/11/2026)

Conteúdo claro e denso; **menu lateral verde-escuro da marca**, que é a identidade do One herdada do legado e deve ser mantida. No conteúdo, o verde é o único acento e aparece só em ação primária, seleção, foco e link. Profundidade só por bordas; sombra apenas no que flutua.

### Menu lateral (verde)

| Papel | Valor |
| --- | --- |
| Fundo | `#112622` (também na barra do topo no celular) |
| Wordmark "One" e nome do usuário | `#FFFFFF` |
| Item | texto `#C1D9D4`, ícone `#7FA096` |
| Item em hover | fundo `#1A332C`, texto `#FFFFFF` |
| Item ativo | fundo `#2B4D43`, texto e ícone `#FFFFFF`, peso 600 |
| Rótulo de grupo, papel do usuário, botões de ícone | `#9DB8B1` |
| Divisória | `#234038` |
| Avatar | fundo `#34594F`, texto `#FFFFFF` |
| Contador (Avisos) | fundo `#2B4D43`, texto `#FFFFFF` |
| Anel de foco | `#C1D9D4` |

### Cores (papéis)

Só tema claro; não há tema escuro (decisão de 13/11/2026, revisar se surgir demanda). No código, os papéis viram tokens em `apps/web/src/styles.css`.

| Papel | Valor | Uso |
| --- | --- | --- |
| Fundo do app | `#F7F8F8` | área de conteúdo |
| Superfície | `#FFFFFF` | menu lateral, painéis, tabelas, formulários |
| Superfície suave | `#F1F4F3` | hover de linha e de item, faixa de rodapé |
| Borda | `#E3E7E6` | divisórias, contorno de painel |
| Borda de controle | `#C9D1CF` | inputs, selects, botão secundário |
| Texto principal | `#121917` | títulos, conteúdo |
| Texto secundário | `#4F5B58` | itens de menu, descrições |
| Texto terciário | `#66726F` | rótulos de grupo, cabeçalho de tabela, legendas (4,8:1 no branco) |
| Acento | `#214037` | botão primário, ícone do item ativo, link, checkbox |
| Acento forte | `#112622` | hover do botão primário |
| Acento suave | `#EAF2EF` | fundo do item ativo e da linha selecionada |
| Foco | `#34594F` | anel de 2px com 2px de afastamento |
| Sucesso | texto `#17603F` / fundo `#E3F3EA` | "Ativo" |
| Atenção | texto `#7A4D00` / fundo `#FCF1DC` | "Convite pendente" |
| Erro | texto `#A1251C` / fundo `#FCE8E6` | "Bloqueado", erros, `*` |
| Informação | texto `#1D4E89` / fundo `#E5EEFA` | avisos neutros |
| Inativo | texto `#4F5B58` / fundo `#EEF1F0` | "Desativado" |

### Cores de categoria (aprovado em 16/11/2026)

Para itens de uma mesma lista que ganham cor para se distinguir (frentes da escala, turnos, tipos de ausência, séries de gráfico): matizes bem separados e pouco saturados, legíveis no branco; os mais distantes para os itens que aparecem juntos; nunca dois tons do mesmo matiz na mesma lista. Quando a cor é de um cadastro (ex.: frente), ela é dado editável na tela, não constante no código.

Paleta, em ordem de uso: `#C0525E` · `#5A9A64` · `#8462A8` · `#4E8C88` · `#B5609E` · `#C9804A` · `#5677B8` · `#8A8A45` · `#8C6A45` · `#B89A4A` · `#3E4A82` · `#8A4A4A` · `#4F9BC2` · `#6B7684`.

### Tipografia

- **IBM Plex Sans** 400/500/600 na interface inteira; **IBM Plex Mono** 400 só para chaves técnicas (permissões, ids).
- Fontes hospedadas no próprio app (pacotes Fontsource), nunca carregadas do Google Fonts.
- Escala: 12 (legenda, cabeçalho de tabela) · 13 (metadados) · 14 (corpo, controles) · 16 (título de seção) · 22 (título de página) · 28 (título das telas de acesso).
- Números com `tabular-nums`.

### Medidas

- Menu lateral 240px (recolhido 64px); item 36px; ícone 20px.
- Controles 36px de altura no app, 44px nas telas de acesso (com texto de 16px, que evita o zoom automático do iOS ao focar).
- Campos de texto, número, select e busca com texto de 16px no celular e 14px a partir de `sm` (`text-base sm:text-sm`), para o iOS não dar zoom ao focar. Regra única nos campos do kit. Decidido em 23/11/2026.
- Linha de tabela 44px; padding de painel 16px; espaço entre seções 24–32px.
- Raio: 6px controles, 8px painéis e tabelas, 12px modal.
- Tabela encostada na borda de um painel: o fundo do cabeçalho segue o raio da caixa, nunca canto reto sobre o canto arredondado. O `DataTable` já arredonda o topo da caixa que rola (raio interno: 8px menos a borda); tabela fora do kit põe o `overflow-x-auto` no próprio elemento com borda e raio, ou dentro de caixa que corta (ex.: `Caixa`).

### Movimento (aprovado em 14/11/2026)

Leve animação em tudo que abre e fecha por cima da tela, para mostrar de onde veio e para onde foi. Sempre pelos atributos de estado do Base UI (`data-[starting-style]:` e `data-[ending-style]:`), com `motion-reduce:transition-none` em cada peça.

| Peça | Entrada e saída | Duração |
| --- | --- | --- |
| Painel lateral e gaveta do menu (Drawer) | Desliza do lado em que fica (`translateX(100%)` à direita, `-100%` à esquerda); arrastar acompanha o dedo | 200ms, ease-out |
| Fundo (Backdrop) | Esmaece (opacidade); o do painel lateral é só um escurecimento leve (4%), sem desfoque, e só a opacidade anima | igual à da peça que acompanha |
| Modal (AlertDialog, Dialog) | Esmaece e cresce de 95% para 100% (`scale`) | 150ms, ease-out |
| Lista suspensa (Select, Combobox, Menu, Popover) | Esmaece e cresce de 95%, a partir do gatilho (`origin-(--transform-origin)`) | 150ms, ease-out |
| Dica (Tooltip) | Só esmaece | 150ms, ease-out |
| Menu lateral recolhendo | Largura | 200ms, ease-out |
| Robô trabalhando (`RoboTrabalhando`, rodada lendo ou atribuindo) | Ícone `Robot` num anel fino de 40px: sem progresso conhecido, um arco gira; com progresso, o anel enche na proporção real; pausada, parado. Substitui o palco de tela cheia do dashboards-one (aprovado em 23/11/2026) | giro de 1,6s linear; enchimento 300ms, ease-out; nada gira com movimento reduzido |

- **No Tailwind 4, `scale-*` e `translate-*` são propriedades CSS próprias**, não `transform`: a transição lista o que muda (`transition-[opacity,scale]`). Com `transition-[opacity,transform]` o `scale-95` pula sem animar.
- O painel lateral sai deslizando antes de avisar a tela (`onFechar` só depois da saída); trocar de linha troca o conteúdo no lugar, sem deslizar de novo.
- Sem animação de entrada de página, de lista, de linha de tabela ou de número; sem mola, quique ou atraso escalonado.

## Marca

- Nome: **One**. Wordmark em Orbitron 700 com espaçamento largo, herdado do legado; só no logotipo, nunca em títulos ou textos.
- Verdes da marca no legado: `#112622`, `#214037`, `#34594F`, `#6D8C84`, `#C1D9D4`.
- O One foi feito **para** a TeleImagem, mas não é produto **dela**: nenhuma tela leva "TeleImagem" como marca ou assinatura (nem em textos como "equipe da TeleImagem"). E-mails `@teleimagem.com.br` como dado de exemplo de usuário podem.
- Telas de acesso (login, recuperar e definir senha): painel verde `#112622` à esquerda com grade sutil, "One" grande e o desenho de anéis concêntricos com mira (o anel tracejado gira devagar e para com `prefers-reduced-motion`); formulário à direita sobre `#F7F8F8`.

## Navegação

- Menu lateral com só telas de trabalho, em 4 áreas:
  - Painéis: Painel executivo, Volumetria, SLA e prazos, Qualidade.
  - Operação: Importação, Distribuição, Fila pendente, Escala médica.
  - Cadastros: Clientes, Médicos, Exames.
  - Financeiro: Faturamento, Repasse, Pré-pagos, Contratos.
- Rodapé do menu: Avisos (com o contador de pendentes, que atualiza a cada 2 min), Configurações e a conta do usuário (com Sair).
- Menu recolhível (só ícones).
- Subtelas do legado viram abas dentro da tela (ex.: Volumetria › Periódico, Mensal, Cliente, Comparativo).
- **Forma certa no centro, variações penduradas nela**: prioridade e especialidade mostram, no próprio painel, as variações que chegam da MobileMed (com e sem acento, pela volumetria e pela fila, ou com outro nome), com a contagem na lista. Nunca uma lista solta de variações separada da forma certa.
- **Exames padronizados e fora do padrão nunca na mesma lista**: a tela Exames tem as abas Padronizados (o cadastro) e Fora do padrão (grafias que chegam da MobileMed, com quanto valem e o exame padronizado ligado), como no dashboards-one. A busca de exame (quebra, vínculo) só oferece padronizados.
- Detalhe e edição de um item da lista abrem no `PainelLateral`: o Drawer do Base UI, 400px à direita no computador e tela cheia abaixo de `lg`. Componente que o Base UI já tem nunca é imitado com HTML.
- **Painel sempre por cima, com fundo levemente escuro** (decidido em 23/11/2026, substitui o "empurra × por cima"): o painel nunca encolhe a tela. O resto da tela fica atrás de um fundo levemente escuro (o texto principal a 4%, `bg-foreground/[0.04]`), sem desfoque, que não deixa clicar no que está atrás; clicar nele fecha o painel (perguntando antes se o formulário foi alterado). Drawer modal: foco preso no painel e devolvido ao fechar. O fundo entra e sai só com opacidade, no ritmo do painel; a cor não anima. Desfoque foi testado e recusado (23/11/2026).
- **Item de cadastro sempre no painel lateral, para criar e para editar** (decidido em 23/11/2026, substitui "criar simples em diálogo"): o mesmo tipo de item abre sempre no mesmo lugar, em todas as telas, qualquer que seja o número de campos. O `Dialogo` do kit (480px; no celular, folha que sobe de baixo) fica para confirmação e ações pontuais que não são cadastro, como informar um motivo. Formulário alterado (painel ou diálogo) pergunta "Descartar as alterações?" ao fechar (`alterado` + `useAlterado`). Decidido em 23/11/2026.
- **Avisos de sucesso (toast)** nunca cobrem os botões do painel lateral nem os de rodapé (que ficam nas pontas: esquerda no painel, direita nos rodapés de lista e formulário). Posição: embaixo, centralizados na área de conteúdo, entre o menu lateral e o painel aberto (16px das bordas, até 360px). Quando o painel não deixa conteúdo largo ao lado (tela cheia abaixo de `lg`; painel de 400px abaixo de 1280px; painel de 720px abaixo de 1552px), vão para o topo, sobre o título do painel, deixando livre o X. No celular sem painel, no topo, na barra verde à direita do botão do menu. Tela com rodapé fixo (barra de botões `sticky` embaixo, como a do papel) marca o rodapé com `data-rodape-fixo`, e o aviso vai para o topo, centralizado. A faixa não captura cliques; só o aviso. Regra única no `Avisos` do kit (`.faixa-avisos` em `styles.css`); tela nenhuma reposiciona aviso. Aprovado em 18/11/2026.
- **Envio de arquivo** (planilha da MobileMed e, depois, contratos e documentos): no `PainelLateral`, com o `EnvioDeArquivo` do kit (arrastar ou escolher, extensão e tamanho conferidos, barra de progresso do Base UI); o arquivo vai direto ao storage pela URL assinada. Terminou o envio, o painel passa a mostrar o item criado (ex.: a importação na fila), que se atualiza sozinho enquanto roda.
- **Avisos de cadastro**: lista dos pendentes por padrão; o painel do aviso tria (ignorar com motivo, reabrir) e leva ao cadastro certo já com a busca preenchida, porque muitas vezes basta um apelido num cadastro que já existe.
- **Configurações** é uma central com submenu por assunto:
  - Sua conta: Meu perfil (dados, senha, sessões e acessos numa tela só; um item por destino, nunca dois itens para a mesma tela).
  - Acesso: Usuários, Papéis, Chaves dos robôs.
  - Catálogo: Classificação dos exames (modalidades, especialidades, subespecialidades, categorias e prioridades, em abas), Contratados, De-paras (só o que não tem forma certa: valores que não são especialidade e sufixos de cliente), Equipes médicas, Níveis dos médicos.
  - Operação: Importação de laudos (trava contra arquivo incompleto e retenção da linha da planilha), Escala médica, Distribuição (o que vale para todas as frentes do robô; a regra de cada frente fica na aba Distribuição da especialidade ou da modalidade).
  - Financeiro: Faturamento (corte da competência padrão; o corte de cada cliente fica na aba Faturamento do painel do cliente), Tipificação, Impostos, Parâmetros de contrato.
  - Avisos e metas: Notificações, Metas mensais.
  - Cada item exige a sua permissão; sem nenhuma, a entrada Configurações some.

## Ícones (Phosphor, regular)

| Uso | Ícone |
| --- | --- |
| Painel executivo | `Gauge` |
| Volumetria | `ChartBar` |
| SLA e prazos | `Timer` |
| Qualidade | `ShieldCheck` |
| Distribuição (tela de trabalho, Operação) | `Robot` |
| Fila pendente | `Queue` |
| Escala médica | `CalendarDots` |
| Clientes | `Buildings` |
| Médicos | `Stethoscope` |
| Exames | `Flask` |
| Faturamento | `Receipt` |
| Repasse | `HandCoins` |
| Pré-pagos | `Wallet` |
| Contratos | `Signature` |
| Importação (de laudos) | `FileArrowUp` |
| Avisos / Notificações | `Bell` |
| Configurações | `Gear` |
| Recolher menu | `SidebarSimple` |
| Sair | `SignOut` |
| Meu perfil | `UserCircle` |
| Usuários | `Users` |
| Papéis | `IdentificationBadge` |
| Chaves dos robôs | `Key` |
| Classificação dos exames | `BookOpen` |
| Contratados | `Certificate` |
| De-paras | `ArrowsLeftRight` |
| Equipes médicas | `UsersThree` |
| Níveis dos médicos | `Ranking` |
| Distribuição (configuração do robô) | `Robot` |
| Tipificação | `ListChecks` |
| Impostos | `Percent` |
| Parâmetros de contrato | `FileText` |
| Metas mensais | `Target` |
| Buscar / Adicionar / Fechar / Abrir | `MagnifyingGlass` / `Plus` / `X` / `CaretRight` |
| Mostrar / ocultar senha | `Eye` / `EyeSlash` |
| Mais ações | `DotsThree` |

## Formulários

- `*` vermelho no rótulo de todo campo obrigatório + `required`; legenda "* Campo obrigatório" quando há campos opcionais.
- Campo numérico com faixa (`min`/`max`) nunca corrige sozinho para o limite: mostra o erro abaixo do campo ("Use um valor entre 1 e 1440.", "Use um valor a partir de 0.", "Use um valor até 100.") e o formulário não envia até voltar para a faixa. Regra única no `NumberField` do kit; as setas do teclado continuam parando no limite. Aprovado em 18/11/2026.
- Todo campo de texto tem placeholder com um exemplo do formato esperado (`nome@empresa.com.br`, `000.000.000-00`, `Ex.: Maria Souza`). O placeholder nunca substitui o rótulo.

## Acesso (login, recuperação, convite)

- Regras de senha, bloqueio, links e sessão: `apps/api/CLAUDE.md`, item "Autenticação". As telas mostram esses valores (requisitos da senha: "Pelo menos 8 caracteres", "Letras e números", "As duas senhas são iguais").
