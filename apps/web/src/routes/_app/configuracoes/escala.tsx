import { createFileRoute } from '@tanstack/react-router';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { SemPermissao } from '../../../components/estado/estados';
import { pode } from '../../../lib/permissoes';

export const Route = createFileRoute('/_app/configuracoes/escala')({
  head: () => ({ meta: [{ title: 'Escala | Configurações | One' }] }),
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'escala-config.ver') ? <h1>Escala</h1> : <SemPermissao tela="Escala" />}
    </ConfiguracoesLayout>
  );
}
