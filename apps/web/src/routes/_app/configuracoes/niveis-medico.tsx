import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { BotaoAbrir, ListaCadastro } from '../../../components/cadastro/ListaCadastro';
import { PainelItemLista, type RotulosLista } from '../../../components/catalogo/PainelItemLista';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { createDataTableColumnHelper } from '../../../components/data-table/columns';
import { SemPermissao } from '../../../components/estado/estados';
import { Etiqueta } from '../../../components/etiqueta/Etiqueta';
import { PainelCarregando } from '../../../components/painel/PainelCarregando';
import { Select } from '../../../components/select/Select';
import { niveisMedicoControllerAtualizar } from '../../../gen/clients/niveisMedicoControllerAtualizar';
import { niveisMedicoControllerCriar } from '../../../gen/clients/niveisMedicoControllerCriar';
import { niveisMedicoControllerExcluir } from '../../../gen/clients/niveisMedicoControllerExcluir';
import { niveisMedicoControllerListarQueryOptions } from '../../../gen/hooks/useNiveisMedicoControllerListar';
import { niveisMedicoControllerObterQueryOptions } from '../../../gen/hooks/useNiveisMedicoControllerObter';
import type { ItemListaDto } from '../../../gen/types/ItemListaDto';
import { invalidarMedicos } from '../../../lib/medicos';
import { type PodeNaTela, pode, podeNaTela } from '../../../lib/permissoes';

const POR_PAGINA = 25;

const ROTULOS: RotulosLista = {
  singular: 'nível',
  genero: 'm',
  campoNome: 'Nome',
  exemploNome: 'Ex.: Nível 2',
  exemploDescricao: 'Ex.: Staff com 5 anos de casa',
};

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

export const Route = createFileRoute('/_app/configuracoes/niveis-medico')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'medicos.ver')) return;
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id)
      void context.queryClient.prefetchQuery(
        niveisMedicoControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    await Promise.all([
      context.queryClient.ensureQueryData(niveisMedicoControllerListarQueryOptions(consulta(deps))),
    ]);
  },
  head: () => ({ meta: [{ title: 'Níveis dos médicos | One' }] }),
  component: PaginaNiveis,
});

function PaginaNiveis() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'medicos.ver') ? (
        <Niveis permissoes={podeNaTela(sessao, 'medicos')} />
      ) : (
        <SemPermissao tela="Níveis dos médicos" />
      )}
    </ConfiguracoesLayout>
  );
}

const coluna = createDataTableColumnHelper<ItemListaDto>();

function Niveis({ permissoes }: { permissoes: PodeNaTela }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: pagina } = useSuspenseQuery(
    niveisMedicoControllerListarQueryOptions(consulta(busca)),
  );

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
        header: 'Nome',
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
      coluna.accessor('descricao', {
        header: 'Descrição',
        cell: (info) => <span className="text-muted-foreground">{info.getValue() ?? '—'}</span>,
      }),
      coluna.accessor('ordem', {
        header: () => <span className="block text-right">Ordem</span>,
        cell: (info) => <span className="block text-right">{info.getValue()}</span>,
      }),
      coluna.accessor('ativo', {
        header: 'Situação',
        cell: (info) =>
          info.getValue() ? (
            <Etiqueta tom="sucesso">Ativo</Etiqueta>
          ) : (
            <Etiqueta tom="inativo">Inativo</Etiqueta>
          ),
      }),
    ],
    [abrir],
  );

  // Ver e editar abrem no painel ao lado da lista; criar abre num diálogo, fora dele.
  const nivel =
    busca.id || (busca.novo && permissoes.criar) ? (
      <PainelNivel
        key={busca.id ?? 'novo'}
        id={busca.id}
        permissoes={permissoes}
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
    ) : undefined;

  return (
    <>
      <ListaCadastro
        titulo="Níveis dos médicos"
        novo={
          permissoes.criar
            ? { rotulo: 'Novo nível', onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })) }
            : undefined
        }
        busca={{ valor: busca.busca, rotulo: 'Buscar níveis', placeholder: 'Nome ou descrição' }}
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
              { valor: 'ativos', rotulo: 'Ativos' },
              { valor: 'inativos', rotulo: 'Inativos' },
            ]}
            className="flex-[1_1_180px] md:flex-[0_1_200px]"
          />
        }
        colunas={colunas}
        itens={pagina.itens}
        getRowId={(item) => item.id}
        selecionadoId={busca.id}
        onAbrir={abrir}
        pagina={pagina.pagina}
        porPagina={pagina.porPagina}
        total={pagina.total}
        vazio={{
          titulo: 'Nenhum nível cadastrado.',
          texto: permissoes.criar
            ? 'Cadastre os níveis (Nível 0 a 6, 1.1…) para escolher no cadastro do médico.'
            : 'Quem administra os médicos cadastra os níveis.',
        }}
        onFiltrar={filtrar}
        onLimparFiltros={() => filtrar({ busca: undefined, situacao: undefined })}
        onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
        painel={busca.id ? nivel : undefined}
      />
      {!busca.id && nivel}
    </>
  );
}

function PainelNivel({
  id,
  permissoes,
  onFechar,
  onSalvo,
  onExcluido,
}: {
  id?: string;
  permissoes: PodeNaTela;
  onFechar: () => void;
  onSalvo: (id: string) => Promise<void>;
  onExcluido: () => Promise<void>;
}) {
  const consulta = useQuery({
    ...niveisMedicoControllerObterQueryOptions({ path: { id: id ?? '' } }),
    enabled: Boolean(id),
  });
  const item = consulta.data;
  if (id && !item)
    return (
      <PainelCarregando
        onFechar={onFechar}
        erro={consulta.isError}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );
  return (
    <PainelItemLista
      rotulos={ROTULOS}
      variante="simples"
      item={id ? item : undefined}
      podeEditar={id ? permissoes.editar : permissoes.criar}
      onFechar={onFechar}
      onSalvar={async (dados) => {
        if (id) {
          await niveisMedicoControllerAtualizar({ path: { id }, body: dados }).unwrap();
          await onSalvo(id);
        } else {
          const criado = await niveisMedicoControllerCriar({ body: dados }).unwrap();
          await onSalvo(criado.id);
        }
      }}
      onExcluir={
        id && permissoes.excluir
          ? async () => {
              await niveisMedicoControllerExcluir({ path: { id } }).unwrap();
              await onExcluido();
            }
          : undefined
      }
    />
  );
}
