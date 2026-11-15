import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { BotaoAbrir, ListaCadastro } from '../../../components/cadastro/ListaCadastro';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { createDataTableColumnHelper } from '../../../components/data-table/columns';
import { SemPermissao } from '../../../components/estado/estados';
import { Etiqueta } from '../../../components/etiqueta/Etiqueta';
import { PainelEquipe } from '../../../components/medicos/PainelEquipe';
import { PainelCarregando } from '../../../components/painel/PainelCarregando';
import { Select } from '../../../components/select/Select';
import { equipesControllerAtualizar } from '../../../gen/clients/equipesControllerAtualizar';
import { equipesControllerCriar } from '../../../gen/clients/equipesControllerCriar';
import { equipesControllerExcluir } from '../../../gen/clients/equipesControllerExcluir';
import { equipesControllerListarQueryOptions } from '../../../gen/hooks/useEquipesControllerListar';
import { equipesControllerObterQueryOptions } from '../../../gen/hooks/useEquipesControllerObter';
import { medicosControllerListarQueryOptions } from '../../../gen/hooks/useMedicosControllerListar';
import type { EquipeItemDto } from '../../../gen/types/EquipeItemDto';
import { buscarMedicos, invalidarMedicos } from '../../../lib/medicos';
import { pode } from '../../../lib/permissoes';

const POR_PAGINA = 25;
/** Membros de uma equipe, de uma vez (equipes têm poucos médicos; o máximo da API é 100). */
const MEMBROS_POR_CONSULTA = 100;

const buscaSchema = z.object({
  busca: z.string().trim().min(1).optional().catch(undefined),
  situacao: z.enum(['ativos', 'inativos']).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  novo: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = (b: Busca) => ({
  query: {
    busca: b.busca,
    ativo: b.situacao === undefined ? undefined : b.situacao === 'ativos',
    pagina: b.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});
const membrosDa = (equipeId: string) =>
  medicosControllerListarQueryOptions({ query: { equipeId, porPagina: MEMBROS_POR_CONSULTA } });

export const Route = createFileRoute('/_app/configuracoes/equipes')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'medicos.ver')) return;
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id) {
      void context.queryClient.prefetchQuery(
        equipesControllerObterQueryOptions({ path: { id: deps.id } }),
      );
      void context.queryClient.prefetchQuery(membrosDa(deps.id));
    }
    await context.queryClient.ensureQueryData(equipesControllerListarQueryOptions(consulta(deps)));
  },
  head: () => ({ meta: [{ title: 'Equipes médicas | One' }] }),
  component: PaginaEquipes,
});

function PaginaEquipes() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'medicos.ver') ? (
        <Equipes podeEditar={pode(sessao, 'medicos.editar')} />
      ) : (
        <SemPermissao tela="Equipes médicas" />
      )}
    </ConfiguracoesLayout>
  );
}

const coluna = createDataTableColumnHelper<EquipeItemDto>();

function Equipes({ podeEditar }: { podeEditar: boolean }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: pagina } = useSuspenseQuery(equipesControllerListarQueryOptions(consulta(busca)));

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((a) => ({ ...a, ...novos, pagina: undefined }), true),
    [ir],
  );
  const abrir = useCallback((id: string) => ir((a) => ({ ...a, id, novo: undefined })), [ir]);
  const fechar = () => ir((a) => ({ ...a, id: undefined, novo: undefined }));

  const colunas = useMemo(
    () => [
      coluna.accessor('nome', {
        header: 'Equipe',
        cell: (info) => (
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="border-border size-3 flex-none rounded-full border"
              // Cor cadastrada pelo usuário: é dado, não token do tema.
              style={info.row.original.cor ? { backgroundColor: info.row.original.cor } : undefined}
            />
            <BotaoAbrir onAbrir={() => abrir(info.row.original.id)}>{info.getValue()}</BotaoAbrir>
          </span>
        ),
      }),
      coluna.accessor((e) => e.medicoIds.length, {
        id: 'membros',
        header: () => <span className="block text-right">Membros</span>,
        cell: (info) => <span className="block text-right">{info.getValue()}</span>,
      }),
      coluna.accessor('plantao', {
        header: 'Plantão',
        cell: (info) => (info.getValue() ? <Etiqueta tom="info">Plantão</Etiqueta> : '—'),
      }),
      coluna.accessor('ativo', {
        header: 'Situação',
        cell: (info) =>
          info.getValue() ? (
            <Etiqueta tom="sucesso">Ativa</Etiqueta>
          ) : (
            <Etiqueta tom="inativo">Inativa</Etiqueta>
          ),
      }),
    ],
    [abrir],
  );

  return (
    <ListaCadastro
      titulo="Equipes médicas"
      novo={
        podeEditar
          ? { rotulo: 'Nova equipe', onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })) }
          : undefined
      }
      busca={{ valor: busca.busca, rotulo: 'Buscar equipes', placeholder: 'Nome ou descrição' }}
      temFiltro={busca.situacao !== undefined}
      filtros={
        <Select
          aria-label="Filtrar por situação"
          value={busca.situacao ?? ''}
          onValueChange={(valor) =>
            filtrar({ situacao: (valor || undefined) as Busca['situacao'] })
          }
          opcoes={[
            { valor: '', rotulo: 'Todas as situações' },
            { valor: 'ativos', rotulo: 'Ativas' },
            { valor: 'inativos', rotulo: 'Inativas' },
          ]}
          className="flex-[1_1_180px] md:flex-[0_1_200px]"
        />
      }
      colunas={colunas}
      ocultarComPainel={['membros', 'plantao']}
      itens={pagina.itens}
      getRowId={(item) => item.id}
      selecionadoId={busca.id}
      onAbrir={abrir}
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhuma equipe cadastrada.',
        texto: podeEditar
          ? 'Crie a primeira equipe e escolha os médicos que fazem parte dela.'
          : 'Quem administra os médicos cadastra as equipes.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined, situacao: undefined })}
      onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
      painel={
        busca.id || (busca.novo && podeEditar) ? (
          <PainelDaEquipe
            key={busca.id ?? 'novo'}
            id={busca.id}
            podeEditar={podeEditar}
            onFechar={fechar}
            onSalvo={async (id) => {
              await invalidarMedicos(queryClient);
              ir((a) => ({ ...a, novo: undefined, id }), true);
            }}
            onExcluido={async () => {
              fechar();
              await invalidarMedicos(queryClient);
            }}
          />
        ) : undefined
      }
    />
  );
}

function PainelDaEquipe({
  id,
  podeEditar,
  onFechar,
  onSalvo,
  onExcluido,
}: {
  id?: string;
  podeEditar: boolean;
  onFechar: () => void;
  onSalvo: (id: string) => Promise<void>;
  onExcluido: () => Promise<void>;
}) {
  const consultaEquipe = useQuery({
    ...equipesControllerObterQueryOptions({ path: { id: id ?? '' } }),
    enabled: Boolean(id),
  });
  const consultaMembros = useQuery({ ...membrosDa(id ?? ''), enabled: Boolean(id) });
  const equipe = consultaEquipe.data;
  const membros = consultaMembros.data;
  if (id && (!equipe || !membros))
    return (
      <PainelCarregando
        onFechar={onFechar}
        erro={consultaEquipe.isError || consultaMembros.isError}
        onTentarDeNovo={() => {
          void consultaEquipe.refetch();
          void consultaMembros.refetch();
        }}
      />
    );
  return (
    <PainelEquipe
      equipe={id ? equipe : undefined}
      membros={(membros?.itens ?? []).map((m) => ({ valor: m.id, rotulo: m.nome }))}
      buscarMedicos={buscarMedicos}
      podeEditar={podeEditar}
      onFechar={onFechar}
      onSalvar={async (dados) => {
        if (id) {
          await equipesControllerAtualizar({ path: { id }, body: dados }).unwrap();
          await onSalvo(id);
        } else {
          const criada = await equipesControllerCriar({ body: dados }).unwrap();
          await onSalvo(criada.id);
        }
      }}
      onExcluir={
        id
          ? async () => {
              await equipesControllerExcluir({ path: { id } }).unwrap();
              await onExcluido();
            }
          : undefined
      }
    />
  );
}
