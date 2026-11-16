import { createFileRoute } from '@tanstack/react-router';

import { SemPermissao } from '../../../components/estado/estados';
import { pode } from '../../../lib/permissoes';

export const Route = createFileRoute('/_app/escala/historico')({
  head: () => ({ meta: [{ title: 'Histórico da escala | One' }] }),
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'escala.historico.ver') ? (
    <h1>Histórico da escala</h1>
  ) : (
    <SemPermissao tela="Histórico da escala" />
  );
}
