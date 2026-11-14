import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { MeuPerfil } from '../../../components/meu-perfil/MeuPerfil';
import { contaControllerObterQueryOptions } from '../../../gen/hooks/useContaControllerObter';

export const Route = createFileRoute('/_app/configuracoes/meu-perfil')({
  loader: ({ context }) => context.queryClient.ensureQueryData(contaControllerObterQueryOptions()),
  head: () => ({ meta: [{ title: 'Meu perfil | One' }] }),
  component: PaginaMeuPerfil,
});

function PaginaMeuPerfil() {
  const { sessao } = Route.useRouteContext();
  const { data: conta } = useSuspenseQuery(contaControllerObterQueryOptions());

  return (
    <ConfiguracoesLayout acesso={sessao}>
      <MeuPerfil conta={conta} />
    </ConfiguracoesLayout>
  );
}
