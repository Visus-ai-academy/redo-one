---
name: new-package
description: Cria um novo app em `apps/` ou pacote compartilhado em `packages/` no monorepo seguindo o padrão do template. Use quando pedirem um novo app, lib, pacote ou workspace.
---

# Novo app ou pacote

O passo a passo canônico está na seção "Criando um novo app ou pacote" do `README.md`. Siga-o e use `packages/config` (pacote compartilhado) ou `apps/api` (app Node) como referência.

Checklist:

1. `apps/<nome>` se for executável, `packages/<nome>` se for código compartilhado.
2. `package.json`:
   - `"name": "@repo/<nome>"`, `"private": true`, `"version": "0.0.0"`
   - `devEngines` copiado de outro pacote (exige pnpm; sem isso, `npm`/`npx` funcionam dentro da pasta e escapam das regras de segurança)
   - scripts aplicáveis: `dev`, `build`, `lint`, `typecheck`, `test`, `clean` (mesmo formato dos pacotes existentes)
   - devDependencies `@repo/config: "workspace:*"`, `typescript` e `vitest` nas **mesmas versões exatas** usadas nos outros pacotes
   - lib com build: `exports` apontando para `dist/` com `types` (`"types": "./dist/index.d.ts"`, `"default": "./dist/index.js"`) e script `build` com `tsc -p tsconfig.build.json`
3. `tsconfig.json` estendendo `@repo/config/tsconfig/node.json` ou `react.json`; `tsconfig.build.json` excluindo `src/**/*.test.ts` se houver build.
4. `vitest.config.ts` com `passWithNoTests: true`.
5. Script `lint`: `biome lint --error-on-warnings .` (config vem do `biome.json` da raiz; regras específicas vão em `overrides` lá).
6. `src/index.ts` e o primeiro teste (TDD, ver skill `tdd`).
7. `pnpm install` na raiz, depois `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
8. Se tiver variáveis de ambiente, crie `.env.example`. Atualize a seção "Estrutura" do `README.md`.
