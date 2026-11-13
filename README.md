# monorepo-template

Template de monorepo TypeScript com pnpm workspaces e Turborepo: uma API em NestJS, um front em TanStack Start e pacotes compartilhados.

## Começando um projeto novo

Depois de criar o repositório a partir deste template, abra o Claude Code na raiz e rode **`/init-project`**. Ele:

1. entrevista você sobre o projeto e valida, uma a uma, as decisões: escala, arquitetura do backend (`modular`, `modular-ddd` ou `hexagonal`), multi-tenancy, autenticação e permissões, jobs, tempo real, cache, arquivos, observabilidade, deploy, LGPD e auditoria, SEO e PWA;
2. em cada uma, recomenda a opção mais simples que atende, com o motivo e o que faria a decisão mudar;
3. monta o glossário do domínio, quando a arquitetura pede;
4. depois da sua confirmação, troca os nomes do template pelo do projeto e registra o contexto e as decisões nos `CLAUDE.md`.

O setup não instala nada: cada decisão é implementada quando o primeiro módulo precisar. Monólito modular, SSR, REST + OpenAPI e pt-BR são fixos pela stack.

## Estrutura

```
apps/
  api/          API em NestJS (mínimo para subir)
  web/          Front em TanStack Start (mínimo para subir)
packages/
  config/       tsconfig e Biome compartilhados
```

| Arquivo                    | Função                                                    |
| -------------------------- | --------------------------------------------------------- |
| `pnpm-workspace.yaml`      | Define os workspaces (`apps/*` e `packages/*`)            |
| `turbo.json`               | Tarefas, dependências entre pacotes e cache               |
| `biome.json`               | Biome: lint, formatação e imports (regras por app)        |
| `commitlint.config.js`     | Conventional Commits                                      |
| `.husky/`                  | Hooks de git (`pre-commit` e `commit-msg`)                |
| `.github/workflows/ci.yml` | CI em cada PR                                             |

Cada app tem o próprio `.env.example`. O PostgreSQL de desenvolvimento fica em `apps/api/docker-compose.yml` e usa o `apps/api/.env`.

### `packages/config`

- `tsconfig/base.json`: modo strict, comum a todos
- `tsconfig/node.json`: para código Node (`NodeNext`)
- `tsconfig/react.json`: para apps React com bundler
- `biome`: config base do Biome (formatação, regras recomendadas de lint, organização de imports), estendida pelo `biome.json` da raiz

## Requisitos

- Node na versão do `.nvmrc` (`nvm use`)
- pnpm na versão de `packageManager` do `package.json`. O jeito mais simples é pelo Corepack, que usa automaticamente a versão certa: `npm install -g corepack && corepack enable` (a partir do Node 25 o Corepack não vem mais junto).
- Docker, para o PostgreSQL

**Este repositório não funciona com npm.** `npm install`, `npm run` e `npx` falham de propósito em qualquer pasta (campo `devEngines` em todos os `package.json`): o npm não entende o protocolo `workspace:*` e ignoraria o lockfile e as regras de segurança abaixo.

## Segurança das dependências

Configurado em `pnpm-workspace.yaml` (vale para todos, inclusive no CI):

| Regra                       | O que faz                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `minimumReleaseAge: 10080`  | Só instala versões publicadas há pelo menos 7 dias, inclusive dependências transitivas. Pacotes comprometidos costumam ser detectados e despublicados nesse intervalo |
| `trustPolicy: no-downgrade` | Falha se uma versão nova tiver menos garantias de procedência que as anteriores (sinal de conta comprometida) |
| `strictDepBuilds: true`     | Scripts de instalação (`postinstall` etc.) só rodam se liberados em `allowBuilds`; qualquer outro falha o install |
| `allowBuilds`               | Lista do que pode (`true`) ou não (`false`) rodar script de instalação                      |
| `engineStrict`, `saveExact` | Respeita `engines` das dependências e salva sempre versão exata                              |

Se um `pnpm add` falhar com `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, a versão pedida (ou algo que ela exige) tem menos de 7 dias: use uma versão anterior ou espere. Exceções vão em `minimumReleaseAgeExclude` no `pnpm-workspace.yaml`, com um comentário do porquê, e precisam de revisão no PR.

## Rodando localmente

```bash
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# preencha os valores dos arquivos .env

docker compose -f apps/api/docker-compose.yml up -d
pnpm --filter @repo/api db:migrate   # aplica as migrations do Drizzle
pnpm dev
```

A API sobe na porta definida em `PORT` (padrão `3000`) e o front na porta padrão do Vite (`5173`).

No `apps/web`, as rotas ficam em `src/routes/` (roteamento por arquivos). O `src/routeTree.gen.ts` é gerado automaticamente pelo plugin do TanStack Start ao rodar `dev` ou `build` e deve ser versionado, pois o `typecheck` depende dele.

## Scripts

Rodados na raiz, disparam a tarefa em todos os pacotes via Turborepo:

| Script              | O que faz                                             |
| ------------------- | ----------------------------------------------------- |
| `pnpm dev`          | Sobe os apps em modo desenvolvimento                  |
| `pnpm build`        | Gera o build de todos os pacotes                      |
| `pnpm generate`     | Exporta o OpenAPI da API e gera o cliente Kubb do web |
| `pnpm lint`         | Roda o lint do Biome em cada pacote                   |
| `pnpm check`        | Biome: corrige lint, formatação e imports             |
| `pnpm check:ci`     | Biome sem alterar arquivos (usado no CI)              |
| `pnpm typecheck`    | Checa os tipos com `tsc --noEmit`                     |
| `pnpm test`         | Roda os testes com Vitest                             |
| `pnpm clean`        | Remove `dist`, `coverage` e `.turbo`                  |

Para rodar em um pacote só, use o filtro do Turborepo:

```bash
pnpm turbo run dev --filter=@repo/api
```

Para adicionar uma dependência a um pacote (sempre com versão exata):

```bash
pnpm add --save-exact <pacote> --filter @repo/web
```

## Padrões

- **Commits** seguem [Conventional Commits](https://www.conventionalcommits.org/pt-br/) (`feat: ...`, `fix: ...`), validados pelo commitlint no hook `commit-msg`.
- **Antes de cada commit**, o lint-staged roda o Biome (lint, formatação e imports) nos arquivos alterados.
- **Testes** usam Vitest. Arquivos `*.test.ts(x)` ficam ao lado do código testado.
- **Dependências** usam versões exatas, sem `^` nem `~`.

## Criando um novo app ou pacote

1. Crie a pasta em `apps/<nome>` (algo executável) ou `packages/<nome>` (código compartilhado).
2. Crie o `package.json` com nome `@repo/<nome>`, `"private": true`, o mesmo `devEngines` dos outros pacotes (bloqueia o npm nessa pasta) e os scripts que se aplicam: `dev`, `build`, `lint`, `typecheck`, `test` e `clean`. O Turborepo ignora os que não existirem.
3. Adicione `@repo/config` como devDependency (`"workspace:*"`) junto de `typescript` e `vitest`.
4. Crie o `tsconfig.json` estendendo a variação adequada:

   ```json
   {
     "extends": "@repo/config/tsconfig/node.json",
     "include": ["src"]
   }
   ```

5. O lint e a formatação vêm do `biome.json` da raiz; o script `lint` do pacote é `biome lint --error-on-warnings .`. Regras específicas do pacote entram em `overrides` no `biome.json` da raiz.
6. Para consumir outro pacote do monorepo, adicione-o como dependência com `"workspace:*"`.
7. Rode `pnpm install` na raiz.
