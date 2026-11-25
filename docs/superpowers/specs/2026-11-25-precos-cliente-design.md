# Preços do cliente

Data: 25/11/2026. Aprovado pelo usuário em conversa ("Siga" sobre o esboço com as telas e as recomendações).

## Intenção

O demonstrativo de faturamento precisa do preço de cada laudo. Hoje os preços moram em `precos_servicos` do dashboards-one, com busca em cascata por nome, sentinelas de faixa e duplicadas. Esta etapa traz os preços para o `faturamento` do redo-one com FKs, busca determinística, carga do legado e telas.

## Como o dashboards-one faz (resumo)

Análise completa em `docs/superpowers/specs/2026-11-24-tipificacao-analise.md` (seção "B. Preços do cliente") e no código: `src/lib/services/faturamento.ts` (`buscarPreco`, `criarPrecificador`/`resolverRpc`, linhas 107–556), `src/lib/services/precos.ts`, `components/clientes/PrecosClienteDialog.tsx`, `components/precos/TabelaPrecosManager.tsx`.

- Arranjo de preço = modalidade de preço (RX/DO/MG/CT/MR) + especialidade + categoria (padrão SC) + prioridade (padrão ROTINA) + faixa (`volumeInicial..volumeFinal`) + `condVolume` (MOD, MOD/ESP, MOD/ESP/CAT, TOTAL: dimensão em que o volume da faixa é somado). O volume da faixa soma sem filtrar a tipificação, por cliente, mínimo 1.
- Busca: cascata por id/nome do dono → fallback PLANTÃO ↔ URGÊNCIA → "último recurso" (qualquer faixa > 0, a menor primeiro) → tabela padrão do contratado. Sem preço: R$ 0 e "preços não cadastrados". Ajuste manual no laudo vence tudo.
- Vigência por competência `YYYY-MM` (`vigenciaDesde`/`vigenciaAte`); só 8 linhas a usam.

Números (24/11): 26.645 linhas (25.728 ativas), 218 clientes; faixa real em 33 clientes, o resto sentinela (1–2147483647, 1–999999, 1–9999999, 1–99999999, 0–999999); 428 linhas 0–0; 1.629 grupos repetidos, 115 com valores diferentes; categorias minúsculas ('oit', 'sc'); tabela padrão com 252 linhas em 2 contratados, sem faixa; 85 de 298 clientes ativos sem preço.

## Decisões

Do usuário:

1. **Unidade:** usa a própria tabela; sem o preço nela, a do cliente principal (`clientes.unificado_em_id`); depois a tabela padrão do contratado emissor.
2. **Vigência:** toda alteração tem o campo obrigatório **Vale a partir de \***, só competências abertas ou futuras (nunca fechada/travada), preenchido com a próxima competência. A versão anterior passa a valer até a competência anterior. Não há regra fixa de vigência no código.
3. Seguir as recomendações abaixo.

Recomendações aceitas:

4. **Busca:** unidade → principal → padrão do contratado; dentro de cada tabela, arranjo exato com a faixa que contém o volume; se faltar, fallback PLANTÃO ↔ URGÊNCIA; se faltar, a menor faixa do arranjo (último recurso, como o legado). A cascata por nome sai (tudo é FK). Sem preço em nenhuma: resultado "sem preço" explícito (para "preços não cadastrados"), nunca R$ 0 silencioso.
5. **Faixa opcional:** sentinelas viram sem faixa (null). `cond_volume` como enum (MOD, MOD_ESP, MOD_ESP_CAT, TOTAL; null = MOD_ESP_CAT como o legado trata o nulo — confirmar no código do legado antes de fixar).
6. **Carga:** só as linhas ativas vigentes; categoria normalizada para o catálogo; das 115 duplicadas com valores diferentes vem a mais recente (`updatedAt`), e a lista vai no relatório da carga para o financeiro conferir; repetidas com o mesmo valor viram uma. Linhas 0–0 entram como faixa mínima de último recurso só se o legado as usa assim (verificar). Os de-paras já anotados no TODO: (MG, MAMO) → (MG, MAMA); (DO, D.O) → (DO, MÚSCULO ESQUELÉTICO); os casos restantes vão para o relatório.
7. **Não vêm:** `tipoPreco` (padrão/especial), `aplicarIncremental`, `aplicarLegado`, `linhaArquivo`, `consideraPrioridadePlantao`, `origemReferencialId`.
8. **Auditoria** em toda alteração de preço (entidade crítica). Permissões: `faturamento.precos.editar` (preços do cliente e tabela padrão); ver com `faturamento.ver`. Ninguém recebe o editar por padrão.
9. **Teste de paridade** com set/out/2026: preço unitário de cada laudo do redo-one × o do legado pela chave natural, com a lista das divergências e o motivo.

## Telas

1. **Painel do cliente › aba Preços:** tabela por arranjo (modalidade, especialidade, categoria, prioridade, faixa, valor, desde) com busca; incluir, editar e excluir (com "Vale a partir de \*"); importar e exportar planilha; aviso de arranjo duplicado. Na unidade, os preços dela e o aviso de que o que faltar vem do principal.
2. **Configurações › Faturamento › Tabela padrão:** a mesma tabela, uma por contratado.

## Não objetivos

Demonstrativo, franquia, impostos, pré-pago, ajuste manual por laudo, transformações de especialidade que dependem da dúvida da tomografia (TOMOGRAFIA → NEURO).

## Passos

1. Tabelas (`precos_cliente`, `precos_padrao_contratado`), permissão, carga do legado com relatório.
2. Busca pura (TDD com os casos de borda), volume da faixa e teste de paridade com set/out.
3. Endpoints e telas, validadas num Chromium real.
