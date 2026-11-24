# Tipificação dos laudos

Data: 24/11/2026. Aprovado pelo usuário: "siga com suas recomendações, grupos são as equipes".

## Intenção

A tipificação decide se cada laudo fatura. O demonstrativo de faturamento e o filtro CO/NC/NC1 da Volumetria dependem dela. Ela não depende de nenhuma das perguntas pendentes ao financeiro (preço, franquia, pré-pago, médico sem cadastro, tomografia). A análise completa do dashboards-one, com números reais, está em `docs/superpowers/specs/2026-11-24-tipificacao-analise.md`.

## Como o dashboards-one faz (resumo)

- Motor em `src/lib/services/classificacao.ts`; uso no cálculo em `src/lib/services/laudosFaturaveis.ts:403`; tela em `src/components/configuracoes/regras/*`; models `RegraCategoria`, `SubRegra`, `ClienteRegra`, `ClienteSubRegra`, `ClienteRegraOrdem`, `GrupoMedico`.
- Grava `tipificacaoRegra`/`tipificacaoSubregra` no laudo, por `empresa` (texto). Cliente sem configuração = CO.
- Dois modos de precedência: fixa (Plantão › especialidade com médico › especialidade › modalidade com médico › modalidade › "todos os demais" › regra principal sem sub-regra) e personalizada (lista ordenada). A primeira que casa vence.
- Fatura: com sub-regra vale `SubRegra.fatura`; sem sub-regra, só NC não fatura. Hoje só NC-NF tem `fatura = false`. `repassa` e `categorias` não são lidos.
- Filtro de médico `apenas`/`exceto` por nome normalizado, apelidos e grupos; `exceto` casa com laudo sem médico, `apenas` não.

## Decisões

Do usuário:

1. **Grupos de médicos são as equipes** do contexto `medicos` (`equipes`, `equipes_membros`). Não há cadastro novo de grupos. A carga resolve "Equipe 2" e "Neurologistas" para equipes pelo nome; se uma não existir no redo-one, a carga para e relata (não cria equipe por conta própria).
2. Seguir as recomendações abaixo (2–5).

Recomendações aceitas:

3. **Mudar a configuração não mexe em competência fechada ou travada.** Só as competências abertas são reclassificadas, por job, como no corte da competência (reusar o mesmo mecanismo de bloqueio).
4. **A configuração é por cliente ou unidade.** A unidade (`clientes.unificado_em_id`) usa a própria configuração; sem configuração própria, cai na do principal; sem nenhuma, CO. Isso exige saber a unidade de origem do laudo (ver como a ingestão resolve a unidade; se o laudo não guarda a unidade de origem, guardar).
5. **RADI_IMAGEM × RADI-IMAGEM:** vale a configuração da RADI_IMAGEM (a única com laudos em set/out); a outra é ignorada e listada no relatório da carga.
6. **"Fatura" é dado da sub-regra, como está.** NC1-NF e CO-NF continuam com `fatura = true`, NC-NF com `false`; a tela permite mudar. Sem sub-regra, a regra principal decide: guardar isso como dado da regra (`fatura_sem_subregra`: CO sim, NC não, NC1 sim), não como `if` no código.

Minhas (o usuário pode corrigir):

7. **Um modo só: lista ordenada de linhas por cliente.** A precedência fixa do legado vira linhas na mesma ordem na carga; a tela tem um jeito só de ler a regra ("vale a primeira linha que casar", "Todos os demais" fixo no fim).
8. **Critérios contra o dado resolvido do redo-one** (especialidade, modalidade e prioridade do catálogo; médico por `medico_id`), não contra o texto cru. O agrupamento do legado (ONCO MEDICINA INTERNA → MEDICINA INTERNA, CARDIO COM SCORE → CARDIO, RX → DX/CR) já vem do catálogo; COLUNAS → MÚSCULO ESQUELÉTICO e MAMO → MAMA mudam o critério casado. **Teste de paridade** com set/out/2026: cada laudo do redo-one × `tipificacaoSubregra` do legado pela chave natural, com a lista das divergências e o motivo. Divergência sem explicação bloqueia ligar a classificação.
9. **Resultado em `classificacoes_laudo`** (laudo, regra, sub-regra, fatura, calculado_em), no `faturamento`; calculado na importação (mesma transação) e no job de reclassificação.
10. O que não migra: regra principal secundária (CO nas 20 NC, sem efeito), as 11 ordens `_DIAGNOSTICA` desligadas e vazias, `repassa`, `categorias`.
11. Auditoria em toda mudança de configuração. Permissões novas: `faturamento.tipificacao.editar` (regras, sub-regras e configuração do cliente); ver fica com `faturamento.ver`.

## Telas

1. **Configurações › Faturamento › Tipificação:** regras CO/NC/NC1 (nome, descrição, cor, "fatura sem sub-regra") e as sub-regras de cada uma, com a chave "Fatura" e quantos clientes usam.
2. **Painel do cliente › aba Faturamento › seção Tipificação:** regra principal (vazio = herda do principal ou CO, dito na tela) e a lista ordenada de linhas — "Se *especialidade* for *MEDICINA INTERNA* e o médico for *apenas Rodrigo Vaz de Lima* → *NC-NF*" —, com arrastar para reordenar, "Todos os demais" no fim e prévia de laudos e volume por sub-regra na competência aberta, antes de salvar. Na unidade, a configuração dela.
3. Sem tela nova de grupos: o filtro de médico escolhe médicos e equipes.

## Não objetivos

Demonstrativo, preço, franquia, Volumetria (só deixar a classificação pronta para ela).

## Em aberto (não bloqueia, é dado editável)

Significado de FT/NF; se os `_DIAGNOSTICA` são dos sócios.

## Passos

1. Tabelas, carga do legado (regras, sub-regras, configuração por cliente/unidade, equipes) e permissões.
2. Classificação pura (TDD com os casos de borda), aplicação na importação, job de reclassificação das abertas e teste de paridade com set/out.
3. Telas, validadas num Chromium real.
