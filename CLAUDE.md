# CLAUDE.md

Monorepo TypeScript com pnpm workspaces e Turborepo. Visão geral, setup e convenções no `README.md`.

- `apps/api`: NestJS (ver `apps/api/CLAUDE.md`)
- `apps/web`: TanStack Start (ver `apps/web/CLAUDE.md`)
- `packages/config`: tsconfig e Biome compartilhados

## Comandos

Sempre pela raiz, via Turborepo. Para um pacote só, use `--filter`:

```bash
pnpm lint | pnpm typecheck | pnpm test | pnpm build
pnpm check           # Biome: corrige lint, formatação e imports (check:ci no CI)
pnpm generate        # exporta o OpenAPI da API e gera o cliente Kubb do web
pnpm turbo run test --filter=@repo/api
pnpm add --save-exact <pacote> --filter @repo/web
```

## Regras

- Você decide sozinho quando, qual e como instalar dependências, sempre pela skill `add-dependency` (critérios, limites e quando perguntar antes). Versão exata (`--save-exact`), nunca `^` ou `~`.
- Commits **sempre** na especificação [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), validados pelo commitlint. Ver skill `conventional-commit`.
- **Desenvolvimento em TDD** em todos os apps e pacotes: teste falhando primeiro, depois a implementação mínima, depois refatoração. Ver skill `tdd`.
- Testes com Vitest, em `*.test.ts(x)` ao lado do código. Importe `describe`/`it`/`expect` de `vitest` (sem globals).
- Variáveis de ambiente ficam por app: novas entram no `.env.example` do app (`apps/api` ou `apps/web`), sem valores reais. Não há `.env` na raiz.
- Nunca edite arquivos gerados (`apps/web/src/routeTree.gen.ts`, `apps/web/src/gen/`, `apps/api/openapi.json`, migrations em `apps/api/drizzle/`).
- Para APIs de bibliotecas, consulte a documentação atual (MCP do Context7, ou as skills que vêm dentro dos pacotes em `node_modules/<pacote>/skills/`, como as do TanStack). As versões do template são recentes e podem diferir do que você conhece.

## Ferramentas do Claude Code neste repo

Configuradas em `.claude/settings.json`:

- Plugins: `typescript-lsp` (requer `typescript-language-server` no PATH), `security-guidance`, `claude-security`, `frontend-design`, `claude-md-management`, `context7` (servidor externo da Upstash), `playwright`. Para revisão de código, use os comandos embutidos `/code-review`, `/simplify` e `/security-review`.
- Hooks: Biome (lint, formatação e imports) no arquivo após cada edição; `typecheck` do monorepo ao final de cada turno.
