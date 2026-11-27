import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { Abas } from '../../../components/abas/Abas';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { SemPermissao } from '../../../components/estado/estados';
import { ParametrosRepasse } from '../../../components/repasse-config/ParametrosRepasse';
import { RegrasRepasse } from '../../../components/repasse-config/RegrasRepasse';
import { precosRepasseControllerOpcoesQueryOptions } from '../../../gen/hooks/usePrecosRepasseControllerOpcoes';
import { repasseControllerParametrosQueryOptions } from '../../../gen/hooks/useRepasseControllerParametros';
import { repasseControllerRegrasQueryOptions } from '../../../gen/hooks/useRepasseControllerRegras';
import { pode } from '../../../lib/permissoes';

const ABAS = ['parametros', 'reclassificacoes', 'alternativas'] as const;
type AbaRepasse = (typeof ABAS)[number];
const ROTULOS: Record<AbaRepasse, string> = {
  parametros: 'Parâmetros',
  reclassificacoes: 'Reclassificações',
  alternativas: 'Alternativas de preço',
};

export const Route = createFileRoute('/_app/configuracoes/repasse')({
  validateSearch: z.object({
    aba: z.enum(ABAS).optional().catch(undefined),
    /** Reclassificação ou alternativa aberta no painel, ou "novo". */
    id: z.string().optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ aba: search.aba }),
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'repasse.ver')) return;
    // Sem lançar: a falha vira o aviso da própria aba, com "Tentar de novo".
    await Promise.all([
      context.queryClient.prefetchQuery(precosRepasseControllerOpcoesQueryOptions()),
      (deps.aba ?? 'parametros') === 'parametros'
        ? context.queryClient.prefetchQuery(repasseControllerParametrosQueryOptions())
        : context.queryClient.prefetchQuery(repasseControllerRegrasQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Repasse · Configurações · One' }] }),
  component: PaginaRepasse,
});

function PaginaRepasse() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'repasse.ver') ? <Repasse /> : <SemPermissao tela="Repasse" />}
    </ConfiguracoesLayout>
  );
}

/** Configurações › Repasse: parâmetros, reclassificações e alternativas de preço, com vigência. */
function Repasse() {
  const { sessao } = Route.useRouteContext();
  const { aba = 'parametros', id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const podeEditar = pode(sessao, 'repasse.parametros.editar');
  const ir = (busca: { aba?: AbaRepasse; id?: string }) =>
    void navigate({ search: (a) => ({ ...a, ...busca }) });

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6">
      <h1 className="text-[22px] leading-snug font-semibold">Repasse</h1>
      <Abas
        aria-label="Partes da configuração do repasse"
        valor={aba}
        onMudar={(v) => ir({ aba: v as AbaRepasse, id: undefined })}
        abas={ABAS.map((valor) => ({ valor, rotulo: ROTULOS[valor] }))}
      >
        {aba === 'parametros' ? (
          <ParametrosRepasse podeEditar={podeEditar} />
        ) : (
          <RegrasRepasse
            key={aba}
            qual={aba}
            podeEditar={podeEditar}
            aberto={id === 'novo' && !podeEditar ? undefined : id}
            onAbrir={(novo) => ir({ id: novo })}
            onFechar={() => ir({ id: undefined })}
          />
        )}
      </Abas>
    </div>
  );
}
