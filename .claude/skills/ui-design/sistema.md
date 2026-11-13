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

### Tipografia

- **IBM Plex Sans** 400/500/600 na interface inteira; **IBM Plex Mono** 400 só para chaves técnicas (permissões, ids).
- Escala: 12 (legenda, cabeçalho de tabela) · 13 (metadados) · 14 (corpo, controles) · 16 (título de seção) · 22 (título de página) · 28 (título das telas de acesso).
- Números com `tabular-nums`.

### Medidas

- Menu lateral 240px (recolhido 64px); item 36px; ícone 20px.
- Controles 36px de altura no app, 44px nas telas de acesso.
- Linha de tabela 44px; padding de painel 16px; espaço entre seções 24–32px.
- Raio: 6px controles, 8px painéis e tabelas, 12px modal.

## Marca

- Nome: **One**. Wordmark em Orbitron 700 com espaçamento largo, herdado do legado; só no logotipo, nunca em títulos ou textos.
- Verdes da marca no legado: `#112622`, `#214037`, `#34594F`, `#6D8C84`, `#C1D9D4`.

## Navegação

- Menu lateral com só telas de trabalho, em 4 áreas:
  - Painéis: Painel executivo, Volumetria, SLA e prazos, Qualidade.
  - Operação: Distribuição, Fila pendente, Escala médica.
  - Cadastros: Clientes, Médicos, Exames.
  - Financeiro: Faturamento, Repasse, Pré-pagos, Contratos.
- Rodapé do menu: Avisos (com contador), Configurações e a conta do usuário (com Sair).
- Menu recolhível (só ícones).
- Subtelas do legado viram abas dentro da tela (ex.: Volumetria › Periódico, Mensal, Cliente, Comparativo).
- **Configurações** é uma central com submenu por assunto:
  - Sua conta: Meu perfil, Segurança.
  - Acesso: Usuários, Papéis, Chaves dos robôs.
  - Catálogo: Modalidades e especialidades, De-paras, Equipes médicas.
  - Operação: Robô de distribuição, Escala médica.
  - Financeiro: Tipificação, Impostos, Parâmetros de contrato.
  - Avisos e metas: Notificações, Metas mensais.
  - Cada item exige a sua permissão; sem nenhuma, a entrada Configurações some.

## Ícones (Phosphor, regular)

| Uso | Ícone |
| --- | --- |
| Painel executivo | `Gauge` |
| Volumetria | `ChartBar` |
| SLA e prazos | `Timer` |
| Qualidade | `ShieldCheck` |
| Distribuição | `Shuffle` |
| Fila pendente | `Queue` |
| Escala médica | `CalendarDots` |
| Clientes | `Buildings` |
| Médicos | `Stethoscope` |
| Exames | `Flask` |
| Faturamento | `Receipt` |
| Repasse | `HandCoins` |
| Pré-pagos | `Wallet` |
| Contratos | `Signature` |
| Avisos / Notificações | `Bell` |
| Configurações | `Gear` |
| Recolher menu | `SidebarSimple` |
| Sair | `SignOut` |
| Meu perfil | `UserCircle` |
| Segurança | `Lock` |
| Usuários | `Users` |
| Papéis | `IdentificationBadge` |
| Chaves dos robôs | `Key` |
| Modalidades e especialidades | `BookOpen` |
| De-paras | `ArrowsLeftRight` |
| Equipes médicas | `UsersThree` |
| Robô de distribuição | `Robot` |
| Tipificação | `ListChecks` |
| Impostos | `Percent` |
| Parâmetros de contrato | `FileText` |
| Metas mensais | `Target` |
| Buscar / Adicionar / Fechar / Abrir | `MagnifyingGlass` / `Plus` / `X` / `CaretRight` |
| Mostrar / ocultar senha | `Eye` / `EyeSlash` |
| Mais ações | `DotsThree` |

## Formulários

- `*` vermelho no rótulo de todo campo obrigatório + `required`; legenda "* Campo obrigatório" quando há campos opcionais.

## Acesso (login, recuperação, convite)

- Entrada por e-mail ou CPF + senha; primeiro acesso por convite (link de 7 dias); recuperação por link de 1 hora, de uso único; bloqueio temporário após tentativas falhas. Os prazos e o limite de tentativas são suposições do protótipo, a confirmar.
