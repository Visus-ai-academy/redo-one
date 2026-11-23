import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { CentralConfiguracoes } from '../../../components/configuracoes/CentralConfiguracoes';

export const Route = createFileRoute('/_app/configuracoes/')({
  // A busca da central fica na URL (voltar e mandar o link devolvem a mesma lista).
  validateSearch: z.object({ busca: z.string().optional().catch(undefined) }),
  head: () => ({ meta: [{ title: 'Configurações · One' }] }),
  component: Configuracoes,
});

function Configuracoes() {
  const { sessao } = Route.useRouteContext();
  return <CentralConfiguracoes acesso={sessao} />;
}
