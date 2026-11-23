import { createFileRoute } from '@tanstack/react-router';

import { CentralConfiguracoes } from '../../../components/configuracoes/CentralConfiguracoes';

export const Route = createFileRoute('/_app/configuracoes/')({
  head: () => ({ meta: [{ title: 'Configurações · One' }] }),
  component: Configuracoes,
});

function Configuracoes() {
  const { sessao } = Route.useRouteContext();
  return <CentralConfiguracoes acesso={sessao} />;
}
