import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { DetalheAviso } from '../../components/avisos/DetalheAviso';
import { buttonClassName } from '../../components/button/button-class';
import { BotaoAbrir, ListaCadastro } from '../../components/cadastro/ListaCadastro';
import { createDataTableColumnHelper } from '../../components/data-table/columns';
import { SemPermissao } from '../../components/estado/estados';
import { Etiqueta } from '../../components/etiqueta/Etiqueta';
import { PainelCarregando } from '../../components/painel/PainelCarregando';
import { PainelLateral } from '../../components/painel/PainelLateral';
import { Select } from '../../components/select/Select';
import { useAvisos } from '../../components/toast/use-avisos';
import { avisosControllerIgnorar } from '../../gen/clients/avisosControllerIgnorar';
import { avisosControllerReabrir } from '../../gen/clients/avisosControllerReabrir';
import {
  avisosControllerListarQueryKey,
  avisosControllerListarQueryOptions,
} from '../../gen/hooks/useAvisosControllerListar';
import { avisosControllerObterQueryOptions } from '../../gen/hooks/useAvisosControllerObter';
import type { AvisoDto } from '../../gen/types/AvisoDto';
import { tipoAviso } from '../../gen/types/TipoAviso';
import { ondeProcurar, situacaoDoAviso, tipoDoAviso } from '../../lib/avisos';
import { dataHoraCurta } from '../../lib/datas';
import { pode } from '../../lib/permissoes';

const POR_PAGINA = 25;
const TIPOS = Object.values(tipoAviso);

const buscaSchema = z.object({
  busca: z.string().trim().min(1).optional().catch(undefined),
  tipo: z.enum(TIPOS).optional().catch(undefined),
  /** Sem situação na URL, a lista mostra os pendentes (o trabalho da tela). */
  situacao: z.enum(['ignorado', 'resolvido', 'todas']).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = (b: Busca) => ({
  query: {
    busca: b.busca,
    tipo: b.tipo,
    status: b.situacao === 'todas' ? undefined : (b.situacao ?? ('pendente' as const)),
    pagina: b.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});

export const Route = createFileRoute('/_app/avisos')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'avisos.ver')) return;
    if (deps.id)
      void context.queryClient.prefetchQuery(
        avisosControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    await context.queryClient.ensureQueryData(avisosControllerListarQueryOptions(consulta(deps)));
  },
  head: () => ({ meta: [{ title: 'Avisos de cadastro | One' }] }),
  component: PaginaAvisos,
});

function PaginaAvisos() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'avisos.ver') ? <Avisos /> : <SemPermissao tela="Avisos de cadastro" />;
}

const coluna = createDataTableColumnHelper<AvisoDto>();
const OCULTAR_COM_PAINEL = ['ultimaVezEm', 'ocorrencias'];

function Avisos() {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: pagina } = useSuspenseQuery(avisosControllerListarQueryOptions(consulta(busca)));

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((a) => ({ ...a, ...novos, pagina: undefined }), true),
    [ir],
  );
  const abrir = useCallback((id: string) => ir((a) => ({ ...a, id })), [ir]);

  const colunas = useMemo(
    () => [
      coluna.accessor('valor', {
        header: 'Como chegou',
        cell: (info) => (
          <BotaoAbrir onAbrir={() => abrir(info.row.original.id)}>{info.getValue()}</BotaoAbrir>
        ),
      }),
      coluna.accessor('tipo', { header: 'Tipo', cell: (info) => tipoDoAviso(info.getValue()) }),
      coluna.accessor('ocorrencias', {
        header: () => <span className="block text-right">Laudos</span>,
        cell: (info) => (
          <span className="block text-right tabular-nums">
            {info.getValue().toLocaleString('pt-BR')}
          </span>
        ),
      }),
      coluna.accessor('ultimaVezEm', {
        header: 'Visto por último',
        cell: (info) => (
          <span className="whitespace-nowrap tabular-nums">{dataHoraCurta(info.getValue())}</span>
        ),
      }),
      coluna.accessor('status', {
        header: 'Situação',
        cell: (info) => {
          const s = situacaoDoAviso(info.getValue());
          return <Etiqueta tom={s.tom}>{s.texto}</Etiqueta>;
        },
      }),
    ],
    [abrir],
  );

  return (
    <ListaCadastro
      titulo="Avisos de cadastro"
      busca={{
        valor: busca.busca,
        rotulo: 'Buscar avisos',
        placeholder: 'Nome como chegou da MobileMed',
      }}
      temFiltro={busca.tipo !== undefined || busca.situacao !== undefined}
      filtros={
        <>
          <Select
            aria-label="Filtrar por tipo"
            value={busca.tipo ?? ''}
            onValueChange={(valor) => filtrar({ tipo: (valor || undefined) as Busca['tipo'] })}
            // Só os tipos que o usuário vê (os da tela onde cada um se resolve), vindos da API.
            opcoes={[
              { valor: '', rotulo: 'Todos os tipos' },
              ...pagina.tipos.map((t) => ({ valor: t, rotulo: tipoDoAviso(t) })),
            ]}
            className="flex-[1_1_180px] md:flex-[0_1_200px]"
          />
          <Select
            aria-label="Filtrar por situação"
            value={busca.situacao ?? ''}
            onValueChange={(valor) =>
              filtrar({ situacao: (valor || undefined) as Busca['situacao'] })
            }
            opcoes={[
              { valor: '', rotulo: 'Pendentes' },
              { valor: 'ignorado', rotulo: 'Ignorados' },
              { valor: 'resolvido', rotulo: 'Resolvidos' },
              { valor: 'todas', rotulo: 'Todas as situações' },
            ]}
            className="flex-[1_1_180px] md:flex-[0_1_200px]"
          />
        </>
      }
      colunas={colunas}
      ocultarComPainel={OCULTAR_COM_PAINEL}
      itens={pagina.itens}
      getRowId={(item) => item.id}
      selecionadoId={busca.id}
      onAbrir={abrir}
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhum aviso pendente.',
        texto: 'Cliente, médico ou estudo que a importação não achar no cadastro aparece aqui.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined, tipo: undefined, situacao: undefined })}
      onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
      painel={
        busca.id ? (
          <PainelDoAviso
            key={busca.id}
            id={busca.id}
            onFechar={() => ir((a) => ({ ...a, id: undefined }))}
          />
        ) : undefined
      }
    />
  );
}

function PainelDoAviso({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { sessao } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { sucesso } = useAvisos();
  const opcoes = avisosControllerObterQueryOptions({ path: { id } });
  const consulta = useQuery(opcoes);
  const aviso = consulta.data;
  if (!aviso)
    return (
      <PainelCarregando
        onFechar={onFechar}
        erro={consulta.isError}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );
  const destino = ondeProcurar(aviso);
  // O aviso decidido sai da lista de pendentes, mas o painel continua com ele (já atualizado).
  const atualizar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: opcoes.queryKey }),
      queryClient.invalidateQueries({ queryKey: avisosControllerListarQueryKey() }),
    ]);

  return (
    <PainelLateral titulo={aviso.valor} subtitulo={tipoDoAviso(aviso.tipo)} onFechar={onFechar}>
      <DetalheAviso
        aviso={aviso}
        podeTriar={pode(sessao, 'avisos.triar')}
        procurar={
          <Link
            to={destino.to}
            search={destino.search as never}
            className={buttonClassName({ variant: 'secondary' })}
          >
            {destino.rotulo}
          </Link>
        }
        onIgnorar={async (motivo) => {
          await avisosControllerIgnorar({
            path: { id: aviso.id },
            body: { motivo },
          }).unwrap();
          sucesso('Aviso ignorado.');
          await atualizar();
        }}
        onReabrir={async () => {
          await avisosControllerReabrir({ path: { id: aviso.id } }).unwrap();
          sucesso('Aviso reaberto.');
          await atualizar();
        }}
      />
    </PainelLateral>
  );
}
