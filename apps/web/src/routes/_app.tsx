import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Outlet } from '@tanstack/react-router';

import { AppShell } from '../components/app-shell/AppShell';
import { FaixaAvisos } from '../components/avisos/FaixaAvisos';
import { useAusenciasPendentes } from '../components/escala-ausencias/use-ausencias-pendentes';
import { useResumoAvisosDoResponsavel, useTotalAvisosPendentes } from '../lib/avisos';
import { exigirSessao } from '../lib/guarda';
import { pode } from '../lib/permissoes';
import { sessaoQueryOptions } from '../lib/sessao';

// Layout das telas autenticadas: sem sessão, vai para o login. A guarda é navegação; quem barra
// de verdade é a API, que checa sessão e permissão em todo endpoint.
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => ({
    sessao: await exigirSessao(context.queryClient, location.href),
  }),
  component: LayoutApp,
});

function LayoutApp() {
  // Lê do cache, que a guarda acabou de preencher; atualiza sozinho se a sessão mudar.
  const { data: sessao } = useSuspenseQuery(sessaoQueryOptions());
  const veAvisos = Boolean(sessao && pode(sessao, 'avisos.ver'));
  const avisosPendentes = useTotalAvisosPendentes(veAvisos);
  const avisosDoResponsavel = useResumoAvisosDoResponsavel(veAvisos);
  const ausenciasPendentes = useAusenciasPendentes(
    Boolean(sessao && pode(sessao, 'ausencias.aprovar')),
  );
  if (!sessao) return null;

  return (
    <AppShell
      sessao={sessao}
      contadores={{ '/avisos': avisosPendentes, '/escala/ausencias': ausenciasPendentes }}
      faixa={<FaixaAvisos resumo={avisosDoResponsavel} />}
    >
      <Outlet />
    </AppShell>
  );
}
