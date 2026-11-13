import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/configuracoes/')({
  head: () => ({ meta: [{ title: 'Configurações | One' }] }),
  component: Configuracoes,
});

function Configuracoes() {
  return <h1 className="text-[22px] font-semibold">Configurações</h1>;
}
