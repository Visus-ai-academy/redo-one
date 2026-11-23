import { Button } from '@base-ui/react/button';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { z } from 'zod';

import { AcessoLayout } from '../components/acesso/AcessoLayout';
import { DefinirSenhaForm, LinkExpirado } from '../components/acesso/DefinirSenhaForm';
import { linkSenhaQueryOptions } from '../components/acesso/link-senha';
import { Alerta } from '../components/alerta/Alerta';
import { Skeleton } from '../components/skeleton/Skeleton';

export const Route = createFileRoute('/definir-senha')({
  validateSearch: z.object({ token: z.string().optional() }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(linkSenhaQueryOptions(deps.token)),
  head: () => ({
    // O token vai na URL do e-mail: não deixar que ele vaze no Referer de links externos.
    meta: [{ title: 'Definir senha · One' }, { name: 'referrer', content: 'no-referrer' }],
  }),
  component: DefinirSenha,
  pendingComponent: Carregando,
  errorComponent: Erro,
});

function DefinirSenha() {
  const { token } = Route.useSearch();
  const { data: link } = useSuspenseQuery(linkSenhaQueryOptions(token));

  return (
    <AcessoLayout>
      {link && token ? <DefinirSenhaForm token={token} link={link} /> : <LinkExpirado />}
    </AcessoLayout>
  );
}

function Carregando() {
  return (
    <AcessoLayout>
      <div role="status" aria-busy="true" className="flex flex-col gap-5">
        <span className="sr-only">Carregando</span>
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    </AcessoLayout>
  );
}

function Erro() {
  const router = useRouter();

  return (
    <AcessoLayout>
      <div className="flex flex-col gap-4">
        <Alerta tom="erro">
          Não foi possível abrir o link agora. Confira sua conexão e tente de novo.
        </Alerta>
        <Button
          type="button"
          onClick={() => void router.invalidate()}
          className="text-primary hover:text-primary-hover self-start font-medium underline underline-offset-2"
        >
          Tentar de novo
        </Button>
      </div>
    </AcessoLayout>
  );
}
