# apps/api

API em NestJS 12 (`@nestjs/platform-express`), CommonJS com `module: NodeNext`.

- Entrada em `src/main.ts`; módulo raiz em `src/app.module.ts` (`ConfigModule` global).
- Testes com Vitest + `unplugin-swc` (o SWC emite os metadados de decorators que a DI precisa). Use `@nestjs/testing` para montar módulos.
- Arquivos de teste são `*.test.ts`, não `*.spec.ts` (o `tsconfig.build.json` exclui só `*.test.ts`).
- Configuração lida via `ConfigService`, não `process.env` direto (exceto no bootstrap). Novas variáveis vão em `apps/api/.env.example`.
- CORS liberado só para as origens de `CORS_ORIGIN` (separadas por vírgula).

## Banco de dados (Drizzle + PostgreSQL)

- PostgreSQL local via `apps/api/docker-compose.yml`, que lê `POSTGRES_*` do `apps/api/.env`; a API se conecta pelo `DATABASE_URL` (mesmos valores).
- `DatabaseModule` (global, `src/database/`) provê o Drizzle pelo token `DATABASE` (tipo `Database`). Injete com `@Inject(DATABASE) private readonly db: Database`. O pool fecha sozinho no shutdown.
- Tabelas em `src/database/schema/<dominio>.ts`, reexportadas em `src/database/schema/index.ts` (o tipo `Database` e as queries relacionais dependem disso).
- Migrations: altere o schema → `pnpm --filter @repo/api db:generate` → revise o SQL gerado em `apps/api/drizzle/` → `pnpm --filter @repo/api db:migrate`. Versione a pasta `drizzle/` inteira. Não escreva migrations à mão nem edite as já aplicadas.
- `db:studio` abre o Drizzle Studio para inspecionar dados.
- Acesso ao banco só dentro de repositórios (a implementação concreta da interface do domínio). Services e controllers nunca importam `DATABASE` nem `drizzle-orm`.
- Testes unitários usam repositório fake (in-memory). Testes do repositório concreto rodam contra o Postgres do docker-compose.

## OpenAPI

- `@nestjs/swagger` documenta a API: UI em `/docs` com o servidor rodando; o documento é montado em `src/openapi/openapi.ts`.
- `pnpm generate` na raiz roda `openapi` (`src/openapi/export.ts` gera `apps/api/openapi.json` sem subir o servidor) e depois o Kubb no `apps/web`.
- Todo endpoint é documentado: DTOs com `@ApiProperty`, respostas com `@ApiOkResponse`/`@ApiCreatedResponse` etc., e `@ApiTags` no controller. Sem isso, o front recebe tipos `unknown`.
- Ao mudar contrato (rota, DTO, resposta), rode `pnpm generate` e versione `openapi.json` e `apps/web/src/gen/` juntos.

## Arquitetura

**Arquitetura deste projeto: por contexto (hexagonal, modular-ddd e modular).** Cada módulo segue o nível da tabela abaixo; use a skill indicada.

| Nível | Contextos | Skill |
| --- | --- | --- |
| hexagonal | `ingestao`, `faturamento`, `repasse`, `credito-pre-pago`, `contratos`, `distribuicao` | `hexagonal-architecture` |
| modular-ddd | `escala` | `nest-module` (variante modular-ddd) |
| modular | `qualidade`, `catalogo`, `medicos`, `identidade` | `nest-module` |
| vertical slice | `analytics` | convenção abaixo |

Critério para o nível de um contexto:

1. A regra tem estados, invariantes ou cálculos que precisam ser protegidos? Se sim, no mínimo `modular-ddd`.
2. Além disso, fala com 2 ou mais sistemas externos ou é disparado por várias entradas (tela, cron, webhook, robô)? Se sim, `hexagonal`: cada ação vira um caso de uso único, chamado igual por todas as entradas.
3. Nenhum dos dois: `modular`.

**Por quê:** no legado, a mesma ação (ex.: fechar competência, reprocessar laudos) era disparada por tela, cron, RPA e webhook, e cada caminho reimplementava parte da regra; faturamento, repasse e distribuição tinham contas duplicadas e regras espalhadas. Os seis contextos hexagonais concentram regra rica, integrações (Omie, ClickSign, Altis, MobileMed, MySuite) e várias entradas. Nos demais, hexagonal só acrescentaria cerimônia.

**Revisar se:** um contexto ganhar regra rica ou uma 2ª integração/entrada (sobe de nível) ou virar só CRUD (desce). A mudança vale só para aquele módulo; atualize esta tabela.

**Vertical slice (`analytics`):** painéis e relatórios só de leitura (volumetria, painel executivo, painel TV, análise preditiva, painel IA, painel do médico).

```
src/analytics/
  analytics.module.ts
  indicadores/                          # fórmula oficial de cada KPI e filtros comuns (período, cliente, exclusões)
  <painel>/                             # uma fatia por painel ou consulta, ex.: volumetria-mensal/
    <painel>.controller.ts
    <painel>.query.ts                   # interface da consulta + token de injeção
    drizzle-<painel>.query.ts           # implementação: lê só as tabelas de totais pré-somados
    <painel>.query.test.ts
```

- Uma fatia nunca define a própria fórmula de KPI: usa a de `indicadores/`. Painel novo é fatia nova; KPI novo entra em `indicadores/`.
- Sem escrita: os dados vêm dos contextos que os produzem (ingestão, faturamento, repasse...).
- **Por quê:** o módulo é só leitura e feito de consultas independentes (no legado, ~2.000 linhas num arquivo e 112 KPIs); centralizar as fórmulas resolve as contas duplicadas do legado.
- **Revisar se:** surgir regra de negócio com escrita no `analytics` (ela pertence a outro contexto).

<!-- Definida pelo /init-project. Níveis possíveis:
     - modular: módulos Nest com controller/service/repositório (skill `nest-module`)
     - modular-ddd: o mesmo, com DDD tático no domínio de cada módulo (skill `nest-module`, seção "Variante modular-ddd")
     - hexagonal: ports & adapters / Clean Architecture (skill `hexagonal-architecture`)
     Pode subir de nível depois, módulo por módulo. -->


- Desenvolvimento em TDD (skill `tdd`).
- SOLID em todo o código:
  - Controllers só fazem HTTP (validar entrada, chamar o service, mapear a resposta). Regra de negócio fica nos services.
  - Uma responsabilidade por classe. Um service que cresce demais vira dois.
  - Dependências entram pelo construtor (DI do Nest). Dependências externas (banco, HTTP, fila, relógio) ficam atrás de uma interface com token de injeção, para poderem ser trocadas e mockadas nos testes.
  - Interfaces pequenas e focadas em quem as consome.

## Regras do projeto (desde o primeiro módulo)

- **Nomes:** domínio em pt-BR sem acento, seguindo o glossário do `CLAUDE.md` da raiz (`Competencia`, `FecharCompetencia`, tabela `laudos`); sufixos e métodos técnicos em inglês (`LaudoController`, `CompetenciaRepository`, `findById`).
- **Autenticação:** login próprio (e-mail ou CPF + senha, hash forte), sessão guardada no banco e enviada em cookie `httpOnly`. A sessão é derrubada ao trocar senha, papel ou permissões. Bloqueio após tentativas falhas, recuperação de senha por e-mail, primeiro acesso por convite (nunca senha padrão). Robôs (RPA de importação, distribuição, comentários) usam chave de API própria por robô, comparada em tempo constante, com permissões restritas ao que cada um faz. Webhooks validam assinatura e recusam a chamada se o segredo não estiver configurado. Valores aprovados:
  - **Senha:** mínimo de 8 caracteres, com pelo menos uma letra e um número; sem checagem de senha vazada. Hash com Argon2id.
  - **Bloqueio:** 5 falhas seguidas bloqueiam por 15 minutos, contando por conta e por IP; a mensagem de erro não diz se o e-mail existe. Quem tem `usuarios.desbloquear` libera na hora pela tela Usuários, o que zera o contador e gera evento de auditoria.
  - **Links:** convite vale 7 dias, recuperação vale 1 hora; ambos de uso único, com só o hash do token no banco.
  - **Sessão:** expira após 7 dias sem uso (renovada a cada uso), com limite absoluto de 30 dias. Cookie `httpOnly`, `Secure`, `SameSite=Lax`; token novo a cada login; só o hash do token no banco.
  - **Chaves dos robôs:** enviadas em `Authorization: Bearer` (o `x-api-key` do legado é aceito durante a transição). Validade de 1 ano; até duas chaves ativas por robô durante a troca. No banco, só o prefixo (para identificar) e o hash SHA-256.
  - **Credenciais de integrações de saída** (Altis, ServiceDesk, MobileMed, Omie, ClickSign...): só em variável de ambiente, uma por credencial, declarada sem valor no `apps/api/.env.example` e validada na subida (`src/config/ambiente.ts`). Nunca no banco nem editável por tela: menos superfície (backup, injeção, sessão de admin roubada) e sem chave de cifra para guardar. Trocar a credencial é trocar a variável e reiniciar a API. Revisar se surgir credencial por cliente ou troca frequente por quem não é técnico.
  - **E-mail:** envio atrás de interface com token de injeção; em produção, Amazon SES (ou Resend/Postmark se não houver AWS); em desenvolvimento, Mailpit.
- **Permissões:** RBAC com papéis configuráveis e permissões `tela.ação`, checadas por guard em todo endpoint. Recortes por atributo ficam no service/domínio, com teste: médico só acessa os próprios dados; gestora de escala só os turnos e especialidades do seu escopo; coordenador só a sua especialidade. Acesso a dados de paciente exige permissão específica.
- **Escala moderada:**
  - Toda listagem é paginada.
  - Índices são planejados junto com cada tabela, a partir das consultas que ela vai atender.
  - Nada pesado dentro da requisição: importação, fechamento, geração de PDF/DOCX, e-mails e chamadas a Omie, ClickSign, Altis e MySuite vão para a fila de jobs.
  - Dashboards leem tabelas de totais pré-somados (por dia × cliente × modalidade × especialidade × prioridade), atualizadas pela ingestão; nunca agregam sobre os laudos crus.
  - Listas de filtros vêm dos cadastros, não de `DISTINCT` sobre laudos. Exclusões (médico ou cliente oculto) são colunas booleanas indexadas, não `ILIKE`.
  - Importação incremental: upsert pela identidade do laudo, nunca apagar e reinserir o período. Dado bruto da planilha fica fora da tabela principal.
- **Jobs:** fila no Postgres, trabalhador no processo da API. Todo job é idempotente (rodar duas vezes dá o mesmo resultado que rodar uma) e, quando não pode rodar em paralelo, é único por tipo/chave. Agendamentos usam o mesmo mecanismo. Gravar o dado e enfileirar o job acontecem na mesma transação. Falha definitiva de job crítico (importação, fechamento, recarga, integração financeira) gera alerta.
- **LGPD:**
  - Campos pessoais e de saúde marcados com comentário no schema Drizzle (`// LGPD: pessoal` ou `// LGPD: saúde`).
  - Guardar só o que a regra usa; dado de paciente só nos contextos que precisam dele (distribuição, qualidade); analytics usa pseudônimo.
  - Nada pessoal em logs, mensagens de erro ou serviços externos sem necessidade; nenhum dado de paciente vai para provedores de IA.
  - Cada tabela com dado pessoal tem retenção definida, e o dado de uma pessoa pode ser exportado e excluído ou anonimizado.
- **Auditoria:** tabela de eventos (quem, quando, o quê, valor anterior e novo) nas entidades críticas: abrir/fechar competência e ajustes de faturamento, repasse e adicionais, preços e regras de apuração, crédito pré-pago, escala, usuários/papéis/permissões, todo o `catalogo` (de-paras e regras de quebra decidem especialidade e quantidade faturadas), todo o `medicos` (inclusive a leitura dos dados de pagamento) e acesso a dados de paciente.
- **Arquivos:** storage compatível com S3, atrás de interface. Tudo privado: upload e download por URL assinada e temporária, com validação de tipo e tamanho. Nunca no banco nem no disco da API.
- **Observabilidade:** logs estruturados em JSON, endpoint de health check e monitoramento de erros.

Skills deste app: `nest-module` (criar módulo/controller/service), `api-security-checklist` (revisar segurança de endpoints e bootstrap) e `hexagonal-architecture` (só quando o projeto declarar essa arquitetura acima).
