import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { MeuPerfil } from '../../../components/meu-perfil/MeuPerfil';
import { contaControllerAcessosQueryOptions } from '../../../gen/hooks/useContaControllerAcessos';
import { contaControllerObterQueryOptions } from '../../../gen/hooks/useContaControllerObter';

export const Route = createFileRoute('/_app/configuracoes/meu-perfil')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(contaControllerObterQueryOptions()),
      context.queryClient.ensureQueryData(contaControllerAcessosQueryOptions()),
    ]),
  head: () => ({ meta: [{ title: 'Meu perfil | One' }] }),
  component: PaginaMeuPerfil,
});

function PaginaMeuPerfil() {
  const { sessao } = Route.useRouteContext();
  const { data: conta } = useSuspenseQuery(contaControllerObterQueryOptions());
  const { data: acessos } = useSuspenseQuery(contaControllerAcessosQueryOptions());

  return (
    <ConfiguracoesLayout acesso={sessao}>
      <MeuPerfil conta={conta} acessos={acessos} />
    </ConfiguracoesLayout>
  );
}
