import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { AcessoLayout } from '../components/acesso/AcessoLayout';
import { LoginForm } from '../components/acesso/LoginForm';
import { destinoSeguro } from '../lib/acesso';
import { redirecionarSeLogado } from '../lib/guarda';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  // Quem já tem sessão não vê o login: segue para onde ia.
  beforeLoad: ({ context, search }) =>
    redirecionarSeLogado(context.queryClient, destinoSeguro(search.redirect)),
  head: () => ({ meta: [{ title: 'Entrar | One' }] }),
  component: Login,
});

function Login() {
  const { redirect } = Route.useSearch();

  return (
    <AcessoLayout>
      <LoginForm destino={destinoSeguro(redirect)} />
    </AcessoLayout>
  );
}
