import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { BotaoAbrir, ListaCadastro } from '../../components/cadastro/ListaCadastro';
import { createDataTableColumnHelper } from '../../components/data-table/columns';
import { AbaDistribuicaoMedico } from '../../components/distribuicao/AbaDistribuicaoMedico';
import { SemPermissao } from '../../components/estado/estados';
import { Etiqueta } from '../../components/etiqueta/Etiqueta';
import { HistoricoCadastro } from '../../components/historico-cadastro/HistoricoCadastro';
import { AbaEscalaMedico } from '../../components/medicos/AbaEscalaMedico';
import { FormPagamento } from '../../components/medicos/FormPagamento';
import { PainelMedico } from '../../components/medicos/PainelMedico';
import { SecaoAcesso } from '../../components/medicos/SecaoAcesso';
import { PainelCarregando } from '../../components/painel/PainelCarregando';
import { Select } from '../../components/select/Select';
import { CamposCarregando } from '../../components/skeleton/CamposCarregando';
import { acessoMedicoControllerBuscarContas } from '../../gen/clients/acessoMedicoControllerBuscarContas';
import { acessoMedicoControllerConvidar } from '../../gen/clients/acessoMedicoControllerConvidar';
import { acessoMedicoControllerDesligar } from '../../gen/clients/acessoMedicoControllerDesligar';
import { acessoMedicoControllerLigar } from '../../gen/clients/acessoMedicoControllerLigar';
import { medicosControllerAtualizar } from '../../gen/clients/medicosControllerAtualizar';
import { medicosControllerCriar } from '../../gen/clients/medicosControllerCriar';
import { medicosControllerCriarAlias } from '../../gen/clients/medicosControllerCriarAlias';
import { medicosControllerExcluir } from '../../gen/clients/medicosControllerExcluir';
import { medicosControllerExcluirAlias } from '../../gen/clients/medicosControllerExcluirAlias';
import { medicosControllerSalvarPagamento } from '../../gen/clients/medicosControllerSalvarPagamento';
import { acessoMedicoControllerObterQueryOptions } from '../../gen/hooks/useAcessoMedicoControllerObter';
import { acessoMedicoControllerPapeisQueryOptions } from '../../gen/hooks/useAcessoMedicoControllerPapeis';
import { medicosControllerListarQueryOptions } from '../../gen/hooks/useMedicosControllerListar';
import { medicosControllerObterQueryOptions } from '../../gen/hooks/useMedicosControllerObter';
import { medicosControllerObterPagamentoQueryOptions } from '../../gen/hooks/useMedicosControllerObterPagamento';
import { niveisMedicoControllerListarQueryOptions } from '../../gen/hooks/useNiveisMedicoControllerListar';
import type { MedicoDetalheDto } from '../../gen/types/MedicoDetalheDto';
import type { MedicoResumoDto } from '../../gen/types/MedicoResumoDto';
import { abasDoMedico, invalidarMedicos } from '../../lib/medicos';
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
function Medicos() {
  const { sessao } = Route.useRouteContext();
  const podeCriar = pode(sessao, 'medicos.criar');
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
        podeCriar
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
      itens={pagina.itens}
      getRowId={(item) => item.id}
      selecionadoId={busca.id}
      onAbrir={abrir}
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhum médico cadastrado.',
        texto: podeCriar
          ? 'Cadastre o médico com o nome de exibição; as grafias da MobileMed entram como apelidos.'
          : 'Quem administra os médicos faz o cadastro.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined, situacao: undefined, nivelId: undefined })}
      onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
      painel={
        busca.id || (busca.novo && podeCriar) ? (
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
  const abas = abasDoMedico(sessao);

  return (
    <PainelMedico
      medico={id ? medico : undefined}
      niveis={niveis}
      podeEditar={pode(sessao, id ? 'medicos.editar' : 'medicos.criar')}
      podeCriar={pode(sessao, 'medicos.criar')}
      podeExcluir={pode(sessao, 'medicos.excluir')}
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
        id && pode(sessao, 'medicos.excluir')
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
        medico && abas.acesso.ver ? (
          <AbaAcesso medico={medico} podeEditar={abas.acesso.editar} />
        ) : undefined
      }
      escala={id && pode(sessao, 'escala.ver') ? <AbaEscalaMedico medicoId={id} /> : undefined}
      distribuicao={
        id && abas.distribuicao.ver ? (
          <AbaDistribuicaoMedico medicoId={id} podeEditar={abas.distribuicao.editar} />
        ) : undefined
      }
      historico={id ? <HistoricoCadastro key={id} cadastro="medico" id={id} /> : undefined}
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

/** Usa as rotas do acesso do médico (`medicos.acesso.*`), não as da tela Usuários. */
function AbaAcesso({ medico, podeEditar }: { medico: MedicoDetalheDto; podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const path = { medicoId: medico.id };
  const { data: acesso } = useQuery(acessoMedicoControllerObterQueryOptions({ path }));
  const { data: papeis = [] } = useQuery({
    ...acessoMedicoControllerPapeisQueryOptions({ path }),
    enabled: podeEditar,
  });
  if (!acesso) return <CamposCarregando quantidade={2} />;

  return (
    <SecaoAcesso
      medico={{ nome: medico.nome, email: medico.email }}
      conta={acesso.conta}
      papeis={papeis}
      podeConvidar={podeEditar}
      podeLigar={podeEditar}
      buscarUsuarios={async (termo) => {
        const contas = await acessoMedicoControllerBuscarContas({
          path,
          query: { busca: termo },
        }).unwrap();
        return contas.map((u) => ({ valor: u.id, rotulo: u.nome, detalhe: u.email }));
      }}
      onConvidar={async (dados) => {
        await acessoMedicoControllerConvidar({ path, body: dados }).unwrap();
        await invalidarMedicos(queryClient);
      }}
      onLigar={async (usuarioId) => {
        await acessoMedicoControllerLigar({ path, body: { usuarioId } }).unwrap();
        await invalidarMedicos(queryClient);
      }}
      onDesligar={async () => {
        await acessoMedicoControllerDesligar({ path }).unwrap();
        await invalidarMedicos(queryClient);
      }}
    />
  );
}
