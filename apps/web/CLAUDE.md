# apps/web

Front em TanStack Start (React 19, SSR) sobre Vite.

- Rotas por arquivo em `src/routes/` com `createFileRoute`; layout raiz em `src/routes/__root.tsx`.
- `src/routeTree.gen.ts` é gerado pelo plugin ao rodar `dev`/`build`. Não edite, mas versione (o `typecheck` depende dele).
- Arquivos de rota exportam `Route`; por isso a regra `useComponentExportOnlyModules` do Biome (equivalente ao react-refresh) está desligada em `src/routes/**` e nos testes.
- Código roda no servidor e no cliente: não acesse `window`/`document` fora de efeitos ou código só do cliente.
- Variáveis de ambiente expostas ao cliente usam prefixo `VITE_` e ficam em `apps/web/.env.example`. Nunca coloque segredos nelas.

## Stack

| Uso               | Biblioteca                                     | Onde está configurado                                |
| ----------------- | ---------------------------------------------- | ---------------------------------------------------- |
| Estilo            | Tailwind CSS v4 + `cn` (clsx + tailwind-merge) | `src/styles.css` (tokens), `src/lib/cn.ts`           |
| Tema claro/escuro | Tokens no padrão shadcn/ui (sem o shadcn)      | `src/styles.css`, `src/lib/theme.ts`, `useTheme`     |
| Animações         | `tw-animate-css`                               | `@import` em `src/styles.css`                        |
| Componentes de UI | Base UI (`@base-ui/react`), headless           | Estilizados com Tailwind; isolamento em `styles.css` |
| Formulários       | TanStack Form (`@tanstack/react-form`)         | `src/components/form/` (`useAppForm`)                |
| Validação         | Zod 4 (`zod`)                                  | Validadores do `useAppForm`; schemas em `src/gen/zod` |
| Tabelas           | TanStack Table v9 (`@tanstack/react-table`)    | `src/components/data-table/` (`DataTable`)           |
| Dados do servidor | TanStack Query + `@tanstack/react-router-ssr-query` | `src/router.tsx` (`queryClient` no contexto)    |
| Cliente da API    | Kubb                                           | `kubb.config.ts`, saída em `src/gen/`                |
| Testes            | Vitest + Testing Library + jsdom               | `vite.config.ts`, `src/test/setup.ts`                |

### Como usar

- **Cores e tema**: só tokens semânticos, nunca cores cruas (`bg-blue-500` falha no lint, regra `noTailwindRawColors`). Fundo/texto: `bg-background text-foreground`; superfícies: `bg-card`, `bg-popover`; ação principal: `bg-primary text-primary-foreground`; secundário/neutro: `secondary`, `muted`, `accent`; erro: `destructive`; bordas e foco: `border-border`, `border-input`, `ring-ring`; gráficos: `chart-1`…`chart-5`; raio: `rounded-sm|md|lg|xl` (derivados de `--radius`). Cor nova vira token em `:root` **e** `.dark` e é exposta em `@theme inline`.
- **Dark mode**: classe `.dark` no `<html>` (variante `dark:`). Troca com `useTheme()` de `src/lib/use-theme.ts` (`light`, `dark` ou `system`); o script em `__root.tsx` aplica o tema salvo antes da pintura.
- **Classes**: combine com `cn()` (`src/lib/cn.ts`), que resolve conflitos do Tailwind; componentes aceitam `className` e repassam via `cn`. A ordem das classes é corrigida pelo Biome.
- **Componentes interativos** (dialog, select, menu, tabs, popover) partem do Base UI, não de HTML feito à mão. O Base UI não tem estilo próprio; estilize com Tailwind usando os atributos de estado dele (`data-[invalid]:`, `data-[open]:`, `data-[disabled]:`).
- **Formulários**: `useAppForm` de `src/components/form/form.ts`, com schema Zod em `validators`. Campos via `<form.AppField name="x">{(field) => <field.TextField label="..." />}</form.AppField>`, botão via `<form.AppForm><form.SubmitButton>`. Campo novo: crie o componente com `useFieldContext` em `src/components/form/` e registre em `fieldComponents`.
- **Tabelas**: `createDataTableColumnHelper<T>()` + `<DataTable columns={...} data={...} />`. Defina `columns` fora do componente (ou com `useMemo`). Sorting, paginação etc.: registre a feature em `dataTableFeatures` (`columns.ts`).
- **Dados**: nos loaders, use `context.queryClient.ensureQueryData(...)`; nos componentes, os hooks gerados pelo Kubb. Ver skill `consume-api`.
- `src/gen/` é gerado (`pnpm generate` na raiz). Não edite à mão.

## Regras do projeto

- **SEO:** sistema todo atrás de login. `noindex` no `head` do `__root.tsx` e `public/robots.txt` bloqueando tudo. Se surgir página pública, ela ganha `title`, `description` e Open Graph próprios no `head` da rota, e o `robots.txt`/sitemap são revistos.
- **PWA:** nenhum. Revisar se o portal do médico for liberado e usado pelo celular (nível `instalável`).
- **Atualização automática (polling):** via `refetchInterval` do TanStack Query, só onde a tela precisa e consultando endpoints leves de status, nunca recarregando a página inteira. Intervalos: robô de distribuição a cada 3–5 s só enquanto a rodada está em etapa ativa; status de importação a cada 30 s só enquanto há importação rodando; painéis a cada 1–5 min. Nada consulta com a aba oculta (`refetchIntervalInBackground: false`).
- **Listagens:** sempre paginadas pela API; nada de carregar tudo e filtrar no cliente.
- **Dados pessoais:** exibir dado de paciente só nas telas que precisam dele e para quem tem a permissão; nunca em logs do cliente.

Skills deste app: `react-component` (componentes e rotas) e `consume-api` (integração com a API via Kubb). Para trabalho visual, use também o plugin `frontend-design`.
