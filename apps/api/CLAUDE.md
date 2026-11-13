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

**Arquitetura deste projeto: modular (padrão).**

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

Skills deste app: `nest-module` (criar módulo/controller/service), `api-security-checklist` (revisar segurança de endpoints e bootstrap) e `hexagonal-architecture` (só quando o projeto declarar essa arquitetura acima).
