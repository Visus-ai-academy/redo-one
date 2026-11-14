import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { BotaoAbrir, ListaCadastro } from '../../components/cadastro/ListaCadastro';
import { createDataTableColumnHelper } from '../../components/data-table/columns';
import { SemPermissao } from '../../components/estado/estados';
import { Etiqueta } from '../../components/etiqueta/Etiqueta';
import { FormPagamento } from '../../components/medicos/FormPagamento';
import { PainelMedico } from '../../components/medicos/PainelMedico';
import { SecaoAcesso } from '../../components/medicos/SecaoAcesso';
import { PainelCarregando } from '../../components/painel/PainelCarregando';
import { Select } from '../../components/select/Select';
import { CamposCarregando } from '../../components/skeleton/CamposCarregando';
import { medicosControllerAtualizar } from '../../gen/clients/medicosControllerAtualizar';
import { medicosControllerCriar } from '../../gen/clients/medicosControllerCriar';
import { medicosControllerCriarAlias } from '../../gen/clients/medicosControllerCriarAlias';
import { medicosControllerExcluir } from '../../gen/clients/medicosControllerExcluir';
import { medicosControllerExcluirAlias } from '../../gen/clients/medicosControllerExcluirAlias';
import { medicosControllerSalvarPagamento } from '../../gen/clients/medicosControllerSalvarPagamento';
import { usuariosControllerConvidar } from '../../gen/clients/usuariosControllerConvidar';
import { usuariosControllerListar } from '../../gen/clients/usuariosControllerListar';
import { usuariosControllerVincularMedico } from '../../gen/clients/usuariosControllerVincularMedico';
import { medicosControllerListarQueryOptions } from '../../gen/hooks/useMedicosControllerListar';
import { medicosControllerObterQueryOptions } from '../../gen/hooks/useMedicosControllerObter';
import { medicosControllerObterPagamentoQueryOptions } from '../../gen/hooks/useMedicosControllerObterPagamento';
import { niveisMedicoControllerListarQueryOptions } from '../../gen/hooks/useNiveisMedicoControllerListar';
import { usuariosControllerListarQueryOptions } from '../../gen/hooks/useUsuariosControllerListar';
import { usuariosControllerPapeisQueryOptions } from '../../gen/hooks/useUsuariosControllerPapeis';
import type { MedicoDetalheDto } from '../../gen/types/MedicoDetalheDto';
import type { MedicoResumoDto } from '../../gen/types/MedicoResumoDto';
import { invalidarMedicos } from '../../lib/medicos';
import { pode } from '../../lib/permissoes';

const POR_PAGINA = 25;

const buscaSchema = z.object({
  busca: z.string().trim().min(1).optional().catch(undefined),
  nivelId: z.uuid().optional().catch(undefined),
  situacao: z.enum(['ativos', 'inativos']).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  novo: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = (b: Busca) => ({
  query: {
    busca: b.busca,
    nivelId: b.nivelId,
    ativo: b.situacao === undefined ? undefined : b.situacao === 'ativos',
    pagina: b.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});
/** Níveis ativos para o filtro e o formulário (lista curta; o máximo da API é 100). */
const niveisAtivos = () =>
  niveisMedicoControllerListarQueryOptions({ query: { ativo: true, porPagina: 100 } });

export const Route = createFileRoute('/_app/medicos')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'medicos.ver')) return;
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id)
      void context.queryClient.prefetchQuery(
        medicosControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    await Promise.all([
      context.queryClient.ensureQueryData(medicosControllerListarQueryOptions(consulta(deps))),
      context.queryClient.ensureQueryData(niveisAtivos()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Médicos | One' }] }),
  component: PaginaMedicos,
});

function PaginaMedicos() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'medicos.ver') ? <Medicos /> : <SemPermissao tela="Médicos" />;
}

const coluna = createDataTableColumnHelper<MedicoResumoDto>();
const OCULTAR_COM_PAINEL = ['idMobilemed', 'totalAliases'];

function Medicos() {
  const { sessao } = Route.useRouteContext();
  const podeEditar = pode(sessao, 'medicos.editar');
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: pagina } = useSuspenseQuery(medicosControllerListarQueryOptions(consulta(busca)));
  const { data: niveis } = useSuspenseQuery(niveisAtivos());

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
        header: 'Médico',
        cell: (info) => (
          <BotaoAbrir onAbrir={() => abrir(info.row.original.id)}>
            <span className="flex flex-col leading-snug">
              <span>{info.getValue()}</span>
              {info.row.original.crm && (
                <span className="text-muted-foreground text-[13px] font-normal">
                  CRM {info.row.original.crm}
                </span>
              )}
            </span>
          </BotaoAbrir>
        ),
      }),
      coluna.accessor((m) => m.nivel?.nome ?? '—', { id: 'nivel', header: 'Nível' }),
      coluna.accessor('idMobilemed', {
        header: () => <span className="block text-right">ID na MobileMed</span>,
        cell: (info) => <span className="block text-right">{info.getValue() ?? '—'}</span>,
      }),
      coluna.accessor('totalAliases', {
        header: () => <span className="block text-right">Apelidos</span>,
        cell: (info) => <span className="block text-right">{info.getValue()}</span>,
      }),
      coluna.accessor('ativo', {
        header: 'Situação',
        cell: (info) => (
          <span className="flex flex-wrap gap-1">
            {info.getValue() ? (
              <Etiqueta tom="sucesso">Ativo</Etiqueta>
            ) : (
              <Etiqueta tom="inativo">Inativo</Etiqueta>
            )}
            {info.row.original.ocultoDashboards && (
              <Etiqueta tom="info">Oculto nos painéis</Etiqueta>
            )}
          </span>
        ),
      }),
    ],
    [abrir],
  );

  return (
    <ListaCadastro
      titulo="Médicos"
      novo={
        podeEditar
          ? { rotulo: 'Novo médico', onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })) }
          : undefined
      }
      busca={{
        valor: busca.busca,
        rotulo: 'Buscar médicos',
        placeholder: 'Nome, CRM ou ID na MobileMed',
      }}
      temFiltro={busca.situacao !== undefined || busca.nivelId !== undefined}
      filtros={
        <>
          <Select
            aria-label="Filtrar por nível"
            value={busca.nivelId ?? ''}
            onValueChange={(valor) => filtrar({ nivelId: valor || undefined })}
            opcoes={[
              { valor: '', rotulo: 'Todos os níveis' },
              ...niveis.itens.map((n) => ({ valor: n.id, rotulo: n.nome })),
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
              { valor: '', rotulo: 'Todas as situações' },
              { valor: 'ativos', rotulo: 'Ativos' },
              { valor: 'inativos', rotulo: 'Inativos' },
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
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhum médico cadastrado.',
        texto: podeEditar
          ? 'Cadastre o médico com o nome de exibição; as grafias da MobileMed entram como apelidos.'
          : 'Quem administra os médicos faz o cadastro.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined, situacao: undefined, nivelId: undefined })}
      onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
      painel={
        busca.id || (busca.novo && podeEditar) ? (
          <PainelDoMedico
            key={busca.id ?? 'novo'}
            id={busca.id}
            niveis={niveis.itens}
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

function PainelDoMedico({
  id,
  niveis,
  onFechar,
  onSalvo,
  onExcluido,
}: {
  id?: string;
  niveis: { id: string; nome: string }[];
  onFechar: () => void;
  onSalvo: (id: string) => Promise<void>;
  onExcluido: () => Promise<void>;
}) {
  const { sessao } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const consulta = useQuery({
    ...medicosControllerObterQueryOptions({ path: { id: id ?? '' } }),
    enabled: Boolean(id),
  });
  const medico = consulta.data;
  if (id && !medico)
    return (
      <PainelCarregando
        onFechar={onFechar}
        erro={consulta.isError}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );
  const atualizar = () => invalidarMedicos(queryClient);

  return (
    <PainelMedico
      medico={id ? medico : undefined}
      niveis={niveis}
      podeEditar={pode(sessao, 'medicos.editar')}
      onFechar={onFechar}
      onSalvar={async (dados) => {
        if (id) {
          await medicosControllerAtualizar({ path: { id }, body: dados }).unwrap();
          await onSalvo(id);
        } else {
          const criado = await medicosControllerCriar({ body: dados }).unwrap();
          await onSalvo(criado.id);
        }
      }}
      onExcluir={
        id
          ? async () => {
              await medicosControllerExcluir({ path: { id } }).unwrap();
              await onExcluido();
            }
          : undefined
      }
      onCriarApelido={async (dados) => {
        if (!id) return;
        await medicosControllerCriarAlias({ path: { id }, body: dados }).unwrap();
        await atualizar();
      }}
      onExcluirApelido={async (aliasId) => {
        if (!id) return;
        await medicosControllerExcluirAlias({ path: { id, aliasId } }).unwrap();
        await atualizar();
      }}
      pagamento={
        id && pode(sessao, 'medicos.pagamento.ver') ? (
          <AbaPagamento medicoId={id} podeEditar={pode(sessao, 'medicos.pagamento.editar')} />
        ) : undefined
      }
      acesso={
        medico && pode(sessao, 'usuarios.ver') ? (
          <AbaAcesso
            medico={medico}
            podeConvidar={pode(sessao, 'usuarios.convidar')}
            podeLigar={pode(sessao, 'usuarios.editar')}
          />
        ) : undefined
      }
    />
  );
}

/** Montada só com a aba aberta: cada leitura do pagamento vai para a auditoria. */
function AbaPagamento({ medicoId, podeEditar }: { medicoId: string; podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const opcoes = medicosControllerObterPagamentoQueryOptions({ path: { id: medicoId } });
  // Dado pessoal: não fica no cache depois que a aba fecha.
  const { data, isError } = useQuery({ ...opcoes, gcTime: 0 });
  if (isError) {
    return (
      <p className="text-muted-foreground p-4">
        Não foi possível abrir os dados de pagamento agora. Tente de novo.
      </p>
    );
  }
  if (!data) return <CamposCarregando quantidade={8} />;
  return (
    <FormPagamento
      dados={data}
      podeEditar={podeEditar}
      onSalvar={async (dados) => {
        await medicosControllerSalvarPagamento({ path: { id: medicoId }, body: dados }).unwrap();
        await queryClient.invalidateQueries({ queryKey: opcoes.queryKey });
      }}
    />
  );
}

function AbaAcesso({
  medico,
  podeConvidar,
  podeLigar,
}: {
  medico: MedicoDetalheDto;
  podeConvidar: boolean;
  podeLigar: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: contas } = useQuery(
    usuariosControllerListarQueryOptions({ query: { medicoId: medico.id, porPagina: 1 } }),
  );
  const { data: papeis = [] } = useQuery({
    ...usuariosControllerPapeisQueryOptions(),
    enabled: podeConvidar,
  });
  if (!contas) return <CamposCarregando quantidade={2} />;
  const conta = contas.itens[0] ?? null;

  return (
    <SecaoAcesso
      medico={{ nome: medico.nome, email: medico.email }}
      conta={conta}
      papeis={papeis}
      podeConvidar={podeConvidar}
      podeLigar={podeLigar}
      buscarUsuarios={async (termo) => {
        const { itens } = await usuariosControllerListar({
          query: { busca: termo, porPagina: 20 },
        }).unwrap();
        return itens.map((u) => ({ valor: u.id, rotulo: u.nome, detalhe: u.email }));
      }}
      onConvidar={async (dados) => {
        await usuariosControllerConvidar({ body: { ...dados, medicoId: medico.id } }).unwrap();
        await invalidarMedicos(queryClient);
      }}
      onLigar={async (usuarioId) => {
        await usuariosControllerVincularMedico({
          path: { id: usuarioId },
          body: { medicoId: medico.id },
        }).unwrap();
        await invalidarMedicos(queryClient);
      }}
      onDesligar={async () => {
        if (!conta) return;
        await usuariosControllerVincularMedico({
          path: { id: conta.id },
          body: { medicoId: null },
        }).unwrap();
        await invalidarMedicos(queryClient);
      }}
    />
  );
}
