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
| Tema              | Tokens no padrão shadcn/ui (sem o shadcn), só claro | `src/styles.css` (valores do `sistema.md` da skill `ui-design`) |
| Ícones            | Phosphor (`@phosphor-icons/react`), peso regular | Import por ícone: `import { Gear } from '@phosphor-icons/react'` |
| Fontes            | Fontsource (IBM Plex Sans, IBM Plex Mono, Orbitron), hospedadas no app | `@import` em `src/styles.css`; `font-sans`, `font-mono`, `font-brand` |
| Animações         | `tw-animate-css`                               | `@import` em `src/styles.css`                        |
| Componentes de UI | Base UI (`@base-ui/react`), headless           | Estilizados com Tailwind; isolamento em `styles.css` |
| Formulários       | TanStack Form (`@tanstack/react-form`)         | `src/components/form/` (`useAppForm`)                |
| Validação         | Zod 4 (`zod`)                                  | Validadores do `useAppForm`; schemas em `src/gen/zod` |
| Tabelas           | TanStack Table v9 (`@tanstack/react-table`)    | `src/components/data-table/` (`DataTable`)           |
| Dados do servidor | TanStack Query + `@tanstack/react-router-ssr-query` | `src/router.tsx` (`queryClient` no contexto)    |
| Cliente da API    | Kubb                                           | `kubb.config.ts`, saída em `src/gen/`                |
| Testes            | Vitest + Testing Library + jsdom               | `vite.config.ts`, `src/test/setup.ts`                |

### Como usar

- **Cores e tema**: só tokens semânticos, nunca cores cruas (`bg-blue-500` falha no lint, regra `noTailwindRawColors`). Fundo/texto: `bg-background text-foreground`; superfícies: `bg-card`, `bg-popover`; ação principal: `bg-primary text-primary-foreground`; secundário/neutro: `secondary`, `muted`, `accent`; texto terciário (legendas, cabeçalho de tabela, placeholder): `text-subtle-foreground`; estados: `destructive`, `success`, `warning`, `info`, `inactive` (texto) com `*-soft` (fundo); menu verde: `sidebar-*`; bordas e foco: `border-border`, `border-input` (controles), `ring-ring`; gráficos: `chart-1`…`chart-5`; raio: `rounded-md` (6px, controles), `rounded-lg` (8px, painéis), `rounded-xl` (12px, modal). Cor nova vira token em `:root` e é exposta em `@theme inline`.
- **Tema escuro**: não há, por decisão do usuário (só a paleta clara aprovada). Revisar se surgir demanda.
- **Classes**: combine com `cn()` (`src/lib/cn.ts`), que resolve conflitos do Tailwind; componentes aceitam `className` e repassam via `cn`. A ordem das classes é corrigida pelo Biome.
- **Componentes interativos** (dialog, drawer, select, menu, tabs, popover, tooltip, number field, toggle, avatar, checkbox group, fieldset) partem do Base UI, não de HTML feito à mão. **Sempre:** antes de montar qualquer peça, confira se o Base UI tem (`node_modules/@base-ui/react/` e a doc em `docs/react/components/`); se tem, use. Botão é o `Button` do Base UI com `buttonClassName`. O Base UI não tem estilo próprio; estilize com Tailwind usando os atributos de estado dele (`data-[invalid]:`, `data-[open]:`, `data-[disabled]:`).
- **Kit de componentes**: use os componentes do One em `src/components/` antes de escrever um novo; todos sobre o Base UI e os tokens. Seleção: `Select` (`src/components/select/`), nunca o `<select>` nativo; caixa de marcar: `CaixaDeSelecao` (`src/components/checkbox/`); confirmação de ação destrutiva: `ConfirmarAcao`; status: `Etiqueta`; aviso no fluxo: `Alerta`; bloco com título: `Painel`; painel ao lado de uma lista: `PainelLateral` (Drawer não modal); busca acima de lista: `CampoBusca`; iniciais da pessoa: `Avatar`; rótulo de ícone sozinho: `Dica` (Tooltip); rodapé de lista: `Paginacao`. Componente que faltar nasce no kit, reutilizável, e não dentro de uma tela.
- **Formulários**: `useAppForm` de `src/components/form/form.ts`, com schema Zod em `validators`. Campos via `<form.AppField name="x">{(field) => <field.TextField label="..." />}</form.AppField>`, botão via `<form.AppForm><form.SubmitButton>`. Campo novo: crie o componente com `useFieldContext` em `src/components/form/` e registre em `fieldComponents`.
- **Tabelas**: `createDataTableColumnHelper<T>()` + `<DataTable columns={...} data={...} />`. Defina `columns` fora do componente (ou com `useMemo`). Sorting, paginação etc.: registre a feature em `dataTableFeatures` (`columns.ts`).
- **Dados**: nos loaders, use `context.queryClient.ensureQueryData(...)`; nos componentes, os hooks gerados pelo Kubb. Ver skill `consume-api`.
- `src/gen/` é gerado (`pnpm generate` na raiz). Não edite à mão.
- **Sessão e permissões**: telas autenticadas ficam em `src/routes/_app/` (o `beforeLoad` de `_app.tsx` usa `exigirSessao`); a sessão vem de `sessaoQueryOptions()` (`src/lib/sessao.ts`) e `pode()` (`src/lib/permissoes.ts`) decide o que mostrar. No SSR, o cookie do navegador é repassado à API pelo interceptor de `configurarApi` (`src/lib/api.ts`). Tela de trabalho nova entra em `GRUPOS_MENU` (`src/components/app-shell/menu.ts`) com a permissão `ver`.
- **Dependências no dev**: pacote novo usado no cliente (cada `@base-ui/react/<componente>`) entra em `optimizeDeps.include` do `vite.config.ts`; sem isso, o Vite recarrega a página na primeira visita e a tela para de responder.

## Regras do projeto

- **SEO:** sistema todo atrás de login. `noindex` no `head` do `__root.tsx` e `public/robots.txt` bloqueando tudo. Se surgir página pública, ela ganha `title`, `description` e Open Graph próprios no `head` da rota, e o `robots.txt`/sitemap são revistos.
- **PWA:** nenhum. Revisar se o portal do médico for liberado e usado pelo celular (nível `instalável`).
- **Atualização automática (polling):** via `refetchInterval` do TanStack Query, só onde a tela precisa e consultando endpoints leves de status, nunca recarregando a página inteira. Intervalos: robô de distribuição a cada 3–5 s só enquanto a rodada está em etapa ativa; status de importação a cada 30 s só enquanto há importação rodando; painéis a cada 1–5 min. Nada consulta com a aba oculta (`refetchIntervalInBackground: false`).
- **Listagens:** sempre paginadas pela API; nada de carregar tudo e filtrar no cliente. A exceção é lista curta e limitada que a API já devolve inteira (ex.: sessões abertas, acessos dos últimos 30 dias): pagine no navegador com `usePaginaLocal` (`src/components/paginacao/`) e o rodapé `Paginacao`, 10 por página numa página e 5 num painel lateral.
- **Dados pessoais:** exibir dado de paciente só nas telas que precisam dele e para quem tem a permissão; nunca em logs do cliente.

## Onde cada interação acontece

Nem toda funcionalidade é uma tela nova: antes de desenhar, pondere se cabe no lugar, num popover, num painel lateral, num diálogo, numa aba, numa página ou em outro padrão. O guia (perguntas e exemplos) está na skill `ui-design`, seção "Onde cada interação acontece"; a escolha e o porquê vão no brief da tela.

Skills deste app: `react-component` (componentes e rotas) e `consume-api` (integração com a API via Kubb). Para trabalho visual, use também o plugin `frontend-design`.
