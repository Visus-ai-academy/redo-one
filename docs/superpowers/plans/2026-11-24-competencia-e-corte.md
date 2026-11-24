# Competências e corte configurável: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Competência do laudo calculada por um corte configurável (padrão + por cliente, com vigência), tabela de competências com fechar/reabrir/travar, importação do dashboards-one e as três telas.

**Architecture:** A fórmula pura do corte fica no domínio da `ingestao` (dona de `laudos.competencia`); a configuração (cortes e competências) é do novo contexto hexagonal `faturamento`, que a `ingestao` lê por portas, no molde da `CompetenciasBloqueadas` que já existe. Mudança de corte ou de cliente do laudo enfileira um job da `ingestao` que recalcula só as competências abertas, na mesma fila serial da importação.

**Tech Stack:** NestJS 12, Drizzle + Postgres, graphile-worker, Vitest, TanStack Start + Base UI, cliente Kubb.

**Spec:** `docs/superpowers/specs/2026-11-24-competencia-e-corte-design.md` (ler inteiro antes de qualquer tarefa).

## Global Constraints

- Ler `CLAUDE.md` da raiz, `apps/api/CLAUDE.md` e `apps/web/CLAUDE.md`. `faturamento` é **hexagonal** (skill `hexagonal-architecture`); `ingestao` já é.
- TDD (skill `tdd`): teste falhando, implementação mínima, refatoração. Vitest, `*.test.ts` ao lado do código, importar `describe/it/expect` de `vitest`.
- Datas em UTC no banco; dia e mês decididos em horário de Brasília (UTC−3 fixo), com `diaBrasilia`/`emBrasilia` de `apps/api/src/ingestao/domain/competencia.ts`.
- Competência é texto `"YYYY-MM"`.
- Corte padrão inicial: dia 7, mês `seguinte`, considera a data do exame = sim, desde `"2000-01"`. Com ele o resultado tem de ser idêntico ao `competenciaDoLaudo` de hoje.
- Migrations só por `pnpm --filter @repo/api db:generate`; nunca editar `apps/api/drizzle/`, `apps/api/openapi.json`, `apps/web/src/gen/`, `routeTree.gen.ts` à mão. Contrato mudou → `pnpm generate`.
- Auditoria (`AUDITORIA`, entidade `competencia` e `corte_competencia`) em fechar, reabrir, travar, destravar e criar corte.
- Commits direto na `main`, um por tarefa, Conventional Commits (skill `conventional-commit`), **sem** `Co-Authored-By`. Não fazer push.
- Dependência nova só pela skill `add-dependency` (não se espera nenhuma).
- Toda tela: skill `ui-design` antes, Base UI quando houver o componente, `*` em campo obrigatório, testada num Chromium real antes de dizer pronta.
- Só leitura no dashboards-one.

## Review Focus

1. Laudo assinado às 22h de Brasília no dia do corte (já é o dia seguinte em UTC) fica no mês do corte → teste na Tarefa 1.
2. Corte "dia 31" ou "último dia" em mês de 30 dias e em fevereiro (bissexto e não) → teste na Tarefa 1.
3. Fechar a competência com um recálculo ainda na fila: o job lê as bloqueadas na hora de rodar e não toca nelas → teste na Tarefa 5.
4. Laudo sem cliente resolvido usa o corte padrão; ao ser resolvido pela triagem, é recalculado → testes nas Tarefas 4 e 5.
5. Criar corte com `desde` igual ou anterior à última competência fechada é recusado com mensagem clara (e quando há competência fechada depois de `desde`) → teste na Tarefa 6.

---

### Task 1: Fórmula do corte e da cadeia de vigências (domínio puro)

**Files:**
- Modify: `apps/api/src/ingestao/domain/competencia.ts`
- Test: `apps/api/src/ingestao/domain/competencia.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DiaCorte = number | 'ultimo';            // 1..31 ou último dia
  export interface Corte { dia: DiaCorte; mes: 'proprio' | 'seguinte'; consideraExame: boolean }
  export interface VigenciaCorte { desde: string; corte: Corte }          // cadeia efetiva, já resolvida
  export interface VigenciaCliente { desde: string; corte: Corte | null } // null = "usa o padrão"
  export interface TabelaCortes { padrao: VigenciaCorte[]; porCliente: ReadonlyMap<string, VigenciaCliente[]> }
  export const CORTE_PADRAO_INICIAL: VigenciaCorte; // { desde: '2000-01', corte: { dia: 7, mes: 'seguinte', consideraExame: true } }
  export function competenciaPeloCorte(realizacao: Date, laudo: Date, corte: Corte): string;
  export function cadeiaDoCliente(tabela: TabelaCortes, clienteId: string | null): VigenciaCorte[];
  export function competenciaPelaCadeia(realizacao: Date, laudo: Date, cadeia: VigenciaCorte[]): string;
  ```
  `competenciaDoLaudo(realizacao, laudo)` continua existindo como `competenciaPelaCadeia(realizacao, laudo, [CORTE_PADRAO_INICIAL])`, até a Tarefa 4 trocar o uso.

- [ ] **Step 1: Testes que falham**
  - `competenciaPeloCorte` com o padrão = `competenciaDoLaudo` atual para todo laudo de hora em hora de 2026-01-01 a 2027-01-31, com exame no mesmo instante, 3 dias antes e 40 dias antes (laço; comparar com uma cópia da função antiga dentro do teste).
  - Padrão: exame 30/09 15:00 BRT, laudo 07/10 23:30 BRT → `2026-09`; laudo 08/10 00:10 BRT → `2026-10`; exame 02/10, laudo 03/10 → `2026-10`.
  - `{dia:25, mes:'proprio', consideraExame:false}`: laudo 25/11 23:59 BRT → `2026-11`; 26/11 00:00 BRT → `2026-12`; exame 10/10, laudo 20/11 → `2026-11`.
  - `{dia:'ultimo', mes:'proprio'}`: laudo 30/11 22:00 BRT → `2026-11`; 01/12 00:00 BRT → `2026-12`.
  - `{dia:31, mes:'proprio'}` = `'ultimo'` em fevereiro de 2026 e 2028, abril e dezembro; `{dia:30, mes:'seguinte'}` em janeiro → corte em 28/02 (2026) ou 29/02 (2028).
  - `consideraExame:true` com `{dia:7, mes:'seguinte'}`: exame 02/12, laudo 03/12 → `2026-12` (piso); `consideraExame:false` no mesmo caso → `2026-11`.
  - `cadeiaDoCliente`: sem cliente ou sem vigência → padrão; vigência própria desde `2026-12` → padrão até 2026-11 e próprio depois; "usa o padrão" desde `2027-03` → volta à cadeia padrão a partir dali, inclusive uma vigência padrão criada em `2027-05`.
  - `competenciaPelaCadeia` (regra da spec, seção "Cálculo pela cadeia"): troca padrão → `{25, proprio, false}` desde `2026-12`: laudo 05/12 de exame de novembro (padrão dá `2026-11` < desde) fica `2026-11`; laudo 27/12 → `2027-01`. Troca `{ultimo, proprio}` → padrão desde `2026-11`: laudo 03/11 de exame de outubro fica `2026-11` (nunca antes de `desde`).
- [ ] **Step 2:** `pnpm turbo run test --filter=@repo/api -- competencia` → FAIL.
- [ ] **Step 3: Implementar.** Corte calculado no dia de Brasília da data do laudo: limite = dia `min(dia, últimoDia)` do mês do laudo; se o dia do laudo ≤ limite, o mês pelo corte é o do laudo, senão o seguinte; com `mes:'seguinte'` subtrai-se um mês do resultado. Com `consideraExame`, `max` com o mês do exame. Cadeia: começa pela primeira vigência; para cada seguinte, se a competência atual ≥ `desde`, vira `max(desde, pelo novo corte)`.
- [ ] **Step 4:** testes passam; `pnpm typecheck` verde.
- [ ] **Step 5:** commit `feat(ingestao): competência pelo corte e pela cadeia de vigências`.

### Task 2: Schema do `faturamento` e o padrão inicial

**Files:**
- Create: `apps/api/src/database/schema/faturamento.ts` (reexportar em `schema/index.ts`)
- Create: migration gerada em `apps/api/drizzle/`

**Interfaces:**
- Produces: tabelas
  - `competencias`: `competencia text PK ("YYYY-MM")`, `status text not null ('aberta'|'fechada')`, `fechada_em timestamptz`, `fechada_por_id uuid → usuarios`, `fechada_por_legado text`, `reaberta_em`, `reaberta_por_id`, `reaberta_por_legado`, `importacao_travada_em`, `importacao_travada_por_id`, `importacao_travada_por_legado`, `observacoes text`, `criada_em`, `atualizada_em`. Índice em `status`.
  - `cortes_competencia`: `id uuid`, `cliente_id uuid null → clientes` (null = padrão), `desde text not null`, `usa_padrao boolean not null default false` (só faz sentido com cliente), `dia integer null` (1..31; null com `ultimo_dia` ou `usa_padrao`), `ultimo_dia boolean not null default false`, `mes text null ('proprio'|'seguinte')`, `considera_exame boolean null`, `criado_em`, `criado_por_id`. Únicos parciais: `(desde) where cliente_id is null` e `(cliente_id, desde) where cliente_id is not null`. Check: com `usa_padrao` os campos do corte são nulos; sem ele, `mes` e `considera_exame` não nulos e exatamente um de `dia`/`ultimo_dia`.
- [ ] **Step 1:** escrever o schema; `pnpm --filter @repo/api db:generate`; revisar o SQL; `db:migrate`.
- [ ] **Step 2:** teste de repositório na Tarefa 3 cobre as restrições (inserir linha inválida falha).
- [ ] **Step 3:** commit `feat(faturamento): tabelas de competências e de cortes`.

### Task 3: Repositórios do `faturamento` e as portas da `ingestao`

**Files:**
- Create: `apps/api/src/faturamento/faturamento.module.ts` (registrar no `app.module.ts`)
- Create: `apps/api/src/faturamento/domain/` (`competencia-status.ts` com as transições), `application/ports/competencias.repository.ts`, `application/ports/cortes.repository.ts`, `infrastructure/persistence/drizzle-competencias.repository.ts`, `drizzle-cortes.repository.ts` (+ testes contra o Postgres do docker-compose), `testing/fakes.ts`
- Modify: `apps/api/src/ingestao/application/ports/competencias-bloqueadas.ts` (+ `garantir`), nova porta `apps/api/src/ingestao/application/ports/cortes-competencia.ts`; `ingestao.module.ts` passa a importar as implementações do `faturamento` (remover `sem-competencias-bloqueadas.ts`)

**Interfaces:**
- Produces:
  ```ts
  // ingestao/application/ports/competencias-bloqueadas.ts
  interface CompetenciasBloqueadas { listar(): Promise<string[]>; garantir(competencias: string[]): Promise<void> }
  // ingestao/application/ports/cortes-competencia.ts
  export const CORTES_COMPETENCIA = Symbol('CORTES_COMPETENCIA');
  interface LeitorCortesCompetencia { carregar(): Promise<TabelaCortes> }
  ```
  `listar` = fechadas ∪ com `importacao_travada_em`. `garantir` = insert `aberta` on conflict do nothing. `carregar` = todas as linhas de `cortes_competencia` montadas em `TabelaCortes`; se não houver linha padrão, devolve `[CORTE_PADRAO_INICIAL]`. O módulo do `faturamento` grava a linha padrão inicial no `onModuleInit` se a tabela não tiver nenhuma padrão (idempotente).
- [ ] Testes: repositórios (inclusive restrições da Tarefa 2), `listar`, `garantir` duas vezes, `carregar` com cliente "usa o padrão". Commit `feat(faturamento): competências bloqueadas e cortes para a ingestão`.

### Task 4: A importação calcula pela configuração e cria as competências

**Files:**
- Modify: `apps/api/src/ingestao/domain/preparar-laudo.ts`, `application/use-cases/importar-laudos.ts`, `ingestao.module.ts`, `testing/fakes.ts`
- Test: `preparar-laudo.test.ts`, `importar-laudos.test.ts`, `importar-laudos.integracao.test.ts`

**Interfaces:**
- Consumes: `TabelaCortes`, `cadeiaDoCliente`, `competenciaPelaCadeia` (Tarefa 1); `LeitorCortesCompetencia`, `CompetenciasBloqueadas.garantir` (Tarefa 3).
- Produces: `prepararLaudo(linha, origem, cadastros, pseudonimo, cortes: TabelaCortes)`; competência = `competenciaPelaCadeia(dataRealizacao, dataLaudo, cadeiaDoCliente(cortes, clienteId))` (o `clienteId` já é o do principal quando é unidade).
- [ ] Testes: tudo no padrão → competências iguais às de hoje (casos existentes passam sem mudar valores); cliente com `{25, proprio, false}` desde `2026-11` → laudo 27/11 vai para `2026-12`; laudo sem cliente resolvido usa o padrão; a importação chama `garantir` com as competências dos laudos gravados. Commit `feat(ingestao): competência pelo corte configurado na importação`.

### Task 5: Job de recálculo da competência

**Files:**
- Create: `apps/api/src/ingestao/application/use-cases/recalcular-competencias.ts` (+ test), tarefa em `application/tarefas.ts`, handler no lugar onde as tarefas da `ingestao` são registradas
- Modify: `application/ports/laudos.repository.ts` + `drizzle-laudos.repository.ts` (leitura em lotes e atualização só de `competencia`)
- Modify: onde o cliente de laudos muda depois da importação (triagem de aviso de cliente em `triar-aviso.ts`; unificar e desfazer unidade no `catalogo/clientes`) para enfileirar o job

**Interfaces:**
- Produces: `TAREFA_RECALCULAR_COMPETENCIAS = 'ingestao.recalcular-competencias'`, payload `{ clienteIds: string[] | null }` (null = todos), na `FILA_INGESTAO` (serial com a importação). Função utilitária `enfileirarRecalculoCompetencias(tx, clienteIds)` que grava o job na mesma transação de quem chama (seguir o padrão de enfileirar já usado na `ingestao`).
  `RecalcularCompetencias.executar({ clienteIds })`: lê bloqueadas e cortes **na hora de rodar**; percorre em lotes de 5.000 os laudos dos clientes (ou todos) cujas competências não estão bloqueadas; recalcula; atualiza só os que mudaram e que não iriam para competência bloqueada; chama `garantir` com as novas; devolve `{ lidos, alterados }`. Idempotente.
- [ ] Testes: mudar corte do cliente e rodar → só os laudos dele mudam; competência fechada entre enfileirar e rodar não é tocada; rodar duas vezes → `alterados = 0` na segunda; triagem que resolve o cliente enfileira o job. Commit `feat(ingestao): recálculo da competência quando o corte ou o cliente muda`.

### Task 6: Casos de uso e API do `faturamento`

**Files:**
- Create: `apps/api/src/faturamento/application/use-cases/` `listar-competencias.ts`, `fechar-competencia.ts`, `reabrir-competencia.ts`, `travar-importacao.ts` (travar e destravar), `listar-cortes.ts`, `previa-corte.ts`, `criar-corte.ts` (+ testes com fakes); `infrastructure/http/competencias.controller.ts`, `cortes.controller.ts`, DTOs
- Modify: `apps/api/src/identidade/permissoes/catalogo.ts` (novas especiais em `faturamento`: `faturamento.competencia.travar` "Travar importação", sensível; `faturamento.corte.editar` "Editar corte da competência", sensível)

**Interfaces:**
- Rotas (todas com guard de permissão e OpenAPI completo):
  - `GET /faturamento/competencias` (`faturamento.ver`, paginada, mais nova primeiro; cada uma com status, datas e autores — nome do usuário ou o texto do legado —, trava, `laudos` e `volume` somados de `laudos` agrupados por competência só das da página)
  - `POST /faturamento/competencias/:competencia/fechar` (`faturamento.competencia.fechar`; só `aberta` e com o mês já acabado em Brasília — relógio por porta) · `/reabrir` (`faturamento.competencia.reabrir`; só `fechada`; não mexe na trava) · `/travar` e `/destravar` (`faturamento.competencia.travar`)
  - `GET /faturamento/cortes?clienteId=` (`faturamento.ver`; sem `clienteId` = padrão) — vigências, mais nova primeiro, com autor
  - `POST /faturamento/cortes/previa` e `POST /faturamento/cortes` (`faturamento.corte.editar`), corpo `{ clienteId: string | null, desde, usaPadrao, dia, ultimoDia, mes, consideraExame }`. Validação: `desde` > última competência fechada e nenhuma fechada depois dele (mensagem: "A vigência tem de começar depois da última competência fechada (MM/AAAA)."); `usaPadrao` só com cliente; `desde` sem vigência igual já existente. Prévia: `{ alterados, movimentos: { de, para, laudos }[] }` calculada sobre os laudos das competências abertas ≥ menor competência afetada. Criar: insere a vigência e enfileira o recálculo (`clienteIds: [clienteId]` ou `null` para o padrão) na mesma transação; audita.
- [ ] Testes de caso de uso para cada regra acima (incluindo Review Focus 5) e um teste de integração HTTP de 403 sem permissão (molde `identidade/acesso/permissao.integracao.test.ts`). `pnpm generate`. Commit `feat(faturamento): competências e cortes na API`.

### Task 7: Importação das competências do dashboards-one

**Files:**
- Create: `apps/api/src/migracao-legado/mapear-competencias.ts` (+ test)
- Modify: `ler-legado.ts`, `gravar.ts`, `scripts/migrar-legado.ts` (seguir o molde dos outros mapeamentos)

**Interfaces:**
- Lê `fechamentos_periodo` (só leitura). Mapeia: `status 'aberto'→'aberta'`, `'fechado'→'fechada'`; `dataFechamento`, `reabertoEm`, `importacaoTravadaEm`, `observacoes` como estão; `fechadoPor`/`reabertoPor`/`importacaoTravadaPor` → usuário do redo-one com o mesmo e-mail (`*_por_id`) ou o texto em `*_por_legado`. Upsert por `competencia` (rodar duas vezes dá o mesmo). Não traz cortes por cliente.
- [ ] Testes do mapeamento (outubro/2026 fechado com e-mail conhecido; setembro com `claude-code` → `_por_legado`). Rodar `pnpm --filter @repo/api migrar:legado` no dev e conferir as linhas. Commit `feat(migracao-legado): competências do dashboards-one`.

### Task 8: Tela Faturamento › Competências

**Files:** rota nova em `apps/web/src/routes/_app/faturamento/competencias.tsx` (+ item no menu da área Financeiro por `faturamento.ver`), componentes em `apps/web/src/components/faturamento/`.

- [ ] Skill `ui-design` primeiro. Tabela paginada: Competência (MM/AAAA), Status, Fechada em / por, Reaberta em / por, Importação travada, Laudos, Volume. Ações por permissão com diálogo de confirmação: Fechar, Reabrir, Travar importação, Destravar. Rótulos dizem a data usada ("Fechada em", nunca "Data"). Testes de componente; validar no Chromium com o seed de dev. Commit `feat(web): tela de competências do faturamento`.

### Task 9: Telas do corte (padrão e do cliente)

**Files:** `apps/web/src/routes/_app/configuracoes/faturamento.tsx` (entrada na central de Configurações), aba "Faturamento" no painel do cliente (onde ficam as abas do painel em `clientes.tsx`/`components/cadastro`), componente compartilhado `apps/web/src/components/faturamento/editor-corte.tsx`.

- [ ] Skill `ui-design` primeiro. Mostra a vigência atual em frase ("Laudos assinados de 08 de um mês a 07 do seguinte; considera a data do exame") e o histórico. "Nova vigência": A partir de* (só competências válidas), Dia do corte* (1–31 ou Último dia), Mês do corte* (Próprio mês / Mês seguinte), Considerar a data do exame (sim/não, com ajuda curta); no cliente também "Usar o padrão". Antes de salvar, mostra a prévia ("N laudos mudam: 11/2026 → 12/2026: 120"). Sem `faturamento.corte.editar`, só leitura. Testes de componente; validar no Chromium criando uma vigência de teste num cliente do dev e conferindo a prévia e o recálculo. Commit `feat(web): corte da competência padrão e por cliente`.

### Task 10: Fechamento da etapa

- [ ] `pnpm lint && pnpm typecheck && pnpm test` verdes.
- [ ] `TODO.md` (Fase 5: marcar a ligação da porta `CompetenciasBloqueadas` e registrar o que entrou; anotar "configurar o corte do SROSALIA: 26→25, só data do laudo, depois da importação") e `docs/melhorias-vs-legado.md` (seção 10: corte configurável, campos "Dia de fechamento"/"Dia de faturamento" sem efeito no dashboards-one).
- [ ] Commit `docs: competências e corte configurável`.
