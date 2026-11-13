---
name: consume-api
description: Integra o apps/web com a API usando o cliente gerado pelo Kubb (tipos, fetch, Zod e hooks do TanStack Query). Use ao buscar ou enviar dados para a API a partir do front.
---

# Consumindo a API no apps/web

O front não chama a API com `fetch` escrito à mão. Tudo vem do código gerado pelo Kubb em `src/gen/`, a partir da spec OpenAPI.

## Gerando o cliente

- Fluxo: a API documenta os endpoints com os decorators do `@nestjs/swagger` (`@ApiProperty` nos DTOs, `@ApiOkResponse` etc.) → `pnpm generate` na raiz exporta `apps/api/openapi.json` e roda o Kubb → código em `apps/web/src/gen/`.
- Config: `apps/web/kubb.config.ts` (lê `../api/openapi.json`).
- Rode `pnpm generate` sempre que a API mudar e versione `apps/api/openapi.json` e `src/gen/` junto com a mudança. O `typecheck` e o CI dependem deles.
- Nunca edite `src/gen/` à mão. Se algo gerado não serve, ajuste `kubb.config.ts` ou os decorators da API.
- Endpoint sem decorators do Swagger gera tipos `unknown`. Documente o endpoint na API antes de consumi-lo.

## O que é gerado

| Pasta              | Conteúdo                                           | Use para                               |
| ------------------ | -------------------------------------------------- | -------------------------------------- |
| `src/gen/types/`   | Tipos de request e response                        | Tipar props e estados                  |
| `src/gen/zod/`     | Schemas Zod 4                                      | Validar formulários (TanStack Form)    |
| `src/gen/clients/` | Uma função `fetch` por operação, com validação Zod | Loaders de rota e código fora do React |
| `src/gen/hooks/`   | `useX` / `xQueryOptions` / mutations               | Componentes                            |

A URL base vem de `VITE_API_URL` (em `apps/web/.env.example`). Já fica embutida no cliente gerado.

## Padrões de uso

- O `QueryClient` já está configurado em `src/router.tsx` (um por requisição no SSR, com hidratação automática) e chega às rotas como `context.queryClient`.
- **Leitura na rota**: `loader: ({ context }) => context.queryClient.ensureQueryData(getUserQueryOptions(...))`, e no componente o hook gerado (`useGetUser`) lê do cache sem nova requisição.
- **Leitura em componente**: hooks gerados (`useGetUser`).
- **Escrita**: mutations geradas, invalidando o `queryKey` correspondente no `onSuccess`.
- **Formulários**: `useAppForm` (`src/components/form/form.ts`) com o schema de `src/gen/zod/` em `validators`. No submit, chame a mutation.
- **Listagens**: `DataTable` (`src/components/data-table/`) com os dados do hook gerado. Use uma constante de módulo como fallback de vazio, não `data ?? []` inline (invalida o modelo da tabela a cada render).
- Trate erro, carregamento e estado vazio (`errorComponent` e `pendingComponent` da rota, ou `isError`/`isPending`).

## TDD

- Teste componentes e loaders com a função do cliente mockada (`vi.mock('../gen/clients/getUser')`) ou com `fetch` mockado (`vi.stubGlobal('fetch', ...)`). Nunca use rede real.
- Não escreva testes para o código gerado em si.

## Segurança

- Nada secreto em variáveis `VITE_`: elas vão para o bundle do cliente.
- Autenticação por cookie `httpOnly` emitido pela API é preferível a token no `localStorage`.
