import { createFileRoute } from '@tanstack/react-router';

import { SemPermissao } from '../../../components/estado/estados';
import { pode } from '../../../lib/permissoes';

export const Route = createFileRoute('/_app/escala/')({
  head: () => ({ meta: [{ title: 'Escala | One' }] }),
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'escala.ver') ? <h1>Escala</h1> : <SemPermissao tela="Escala" />;
}
