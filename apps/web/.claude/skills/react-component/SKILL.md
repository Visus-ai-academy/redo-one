---
name: react-component
description: Cria componentes React e rotas do TanStack Start no apps/web com TDD. Use ao adicionar páginas, rotas, layouts ou componentes de UI.
---

# Componentes e rotas no apps/web

Para decisões visuais (layout, tipografia, cores, estética), use também o plugin `frontend-design`.

## Onde colocar

- **Rotas**: `src/routes/` (roteamento por arquivo). `src/routes/users/$id.tsx` → `/users/:id`. Use `createFileRoute` e exporte `Route`. O `routeTree.gen.ts` se atualiza sozinho no `dev`/`build`.
- **Componentes compartilhados**: `src/components/<nome-kebab>/<NomePascal>.tsx` com o teste ao lado (ex.: `src/components/data-table/DataTable.tsx`). Antes de criar, veja se o kit existente já cobre o caso: `src/components/form/` (formulários) e `src/components/data-table/` (tabelas).
- **UI interativa**: construa sobre os primitivos do Base UI (`@base-ui/react/<componente>`), que já trazem acessibilidade e teclado.
- **Componentes usados por uma rota só**: no mesmo arquivo da rota ou em uma pasta ao lado dela.
- **Lógica sem UI** (formatação, regras, hooks): arquivos `.ts` separados, testados sem renderizar nada.

```tsx
// src/routes/users/$id.tsx
import { createFileRoute } from '@tanstack/react-router';

import { getUserQueryOptions, useGetUser } from '../../gen/hooks/useGetUser';

export const Route = createFileRoute('/users/$id')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(getUserQueryOptions({ path: { id: params.id } })),
  component: UserPage,
});

function UserPage() {
  const { id } = Route.useParams();
  const { data: user } = useGetUser({ path: { id } });
  return <h1>{user?.name}</h1>;
}
```

## TDD

1. Extraia a lógica para funções e hooks puros e teste-os primeiro (`*.test.ts`).
2. Componentes: `render` + `screen` de `@testing-library/react` e `userEvent` de `@testing-library/user-event`. Ambiente jsdom e matchers do jest-dom (`toBeInTheDocument` etc.) já estão configurados (`src/test/setup.ts`). Exemplos: `src/components/form/form.test.tsx` e `src/components/data-table/DataTable.test.tsx`.
3. Teste o que o usuário vê e faz (texto, papéis, cliques), não estado interno. Prefira `getByRole`.

## Regras

- Componentes de função, props tipadas com `type`, sem `React.FC`.
- Estilo com Tailwind usando só os tokens do tema (ver "Cores e tema" em `apps/web/CLAUDE.md`). Componentes reutilizáveis aceitam `className` e combinam com `cn()`. Confira o resultado nos dois temas (claro e `.dark`).
- SSR: nada de `window`, `document` ou `localStorage` durante a renderização. Use `useEffect` ou código só do cliente.
- Dados da rota vêm do `loader` (roda no servidor no primeiro acesso), não de `useEffect` + fetch.
- Acessibilidade: elementos semânticos, `label` em inputs, `alt` em imagens, foco visível, navegação por teclado.
- Metadados de página no `head` da rota, como em `__root.tsx`.
- Valide no navegador com o plugin `playwright` quando a mudança for visual ou de interação.
