import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, type ErrorComponentProps, useRouter } from '@tanstack/react-router';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { EstadoDoErro } from '../../../components/estado/EstadoDoErro';
import { MeuPerfil } from '../../../components/meu-perfil/MeuPerfil';
import { contaControllerAcessosQueryOptions } from '../../../gen/hooks/useContaControllerAcessos';
import { contaControllerObterQueryOptions } from '../../../gen/hooks/useContaControllerObter';

export const Route = createFileRoute('/_app/configuracoes/meu-perfil')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(contaControllerObterQueryOptions()),
      context.queryClient.ensureQueryData(contaControllerAcessosQueryOptions()),
    ]),
  head: () => ({ meta: [{ title: 'Meu perfil · One' }] }),
  component: PaginaMeuPerfil,
  errorComponent: ErroDaTela,
});

/** Não abriu (sem permissão na API, servidor fora): o estado do erro pelo código HTTP. */
function ErroDaTela({ error }: ErrorComponentProps) {
  const { sessao } = Route.useRouteContext();
  const router = useRouter();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      <h1 className="text-[22px] leading-snug font-semibold">Meu perfil</h1>
      <EstadoDoErro
        erro={error}
        oQue="os dados da sua conta"
        onTentarDeNovo={() => void router.invalidate()}
        className="p-0"
      />
    </ConfiguracoesLayout>
  );
}

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
