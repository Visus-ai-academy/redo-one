import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
import { useStore } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { Alerta } from '../../../components/alerta/Alerta';
import { mensagemDaApi } from '../../../components/alerta/mensagem-da-api';
import { BolinhaCor } from '../../../components/bolinha-cor/BolinhaCor';
import { buttonClassName } from '../../../components/button/button-class';
import { RodapePainel } from '../../../components/catalogo/rodape-painel';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { createDataTableColumnHelper } from '../../../components/data-table/columns';
import { DataTable } from '../../../components/data-table/DataTable';
import { LinkDaLinha } from '../../../components/data-table/link-da-linha';
import { EstadoDoErro } from '../../../components/estado/EstadoDoErro';
import { SemPermissao } from '../../../components/estado/estados';
import { Etiqueta } from '../../../components/etiqueta/Etiqueta';
import { mesAno } from '../../../components/faturamento/competencias';
import { HistoricoVigencias } from '../../../components/faturamento/historico-vigencias';
import { opcoesAPartirDe } from '../../../components/faturamento/precos';
import { novaVersaoEm, pedidosDoPainel } from '../../../components/faturamento/tipificacao';
import { CampoSomenteLeitura } from '../../../components/form/CampoSomenteLeitura';
import { useAppForm } from '../../../components/form/form';
import { Paginacao } from '../../../components/paginacao/Paginacao';
import { usePaginaLocal } from '../../../components/paginacao/use-pagina-local';
import { useAlterado } from '../../../components/painel/fechamento';
import { Painel } from '../../../components/painel/Painel';
import { PainelLateral } from '../../../components/painel/PainelLateral';
import { Skeleton } from '../../../components/skeleton/Skeleton';
import { useAvisos } from '../../../components/toast/use-avisos';
import { tipificacaoControllerAlterarRegra } from '../../../gen/clients/tipificacaoControllerAlterarRegra';
import { tipificacaoControllerAlterarSubregra } from '../../../gen/clients/tipificacaoControllerAlterarSubregra';
import { tipificacaoControllerCriarRegra } from '../../../gen/clients/tipificacaoControllerCriarRegra';
import { tipificacaoControllerCriarSubregra } from '../../../gen/clients/tipificacaoControllerCriarSubregra';
import { tipificacaoControllerMudarFatura } from '../../../gen/clients/tipificacaoControllerMudarFatura';
import { tipificacaoControllerRemoverFatura } from '../../../gen/clients/tipificacaoControllerRemoverFatura';
import { tipificacaoControllerListarQueryOptions } from '../../../gen/hooks/useTipificacaoControllerListar';
import type { RegraTipificacaoDto } from '../../../gen/types/RegraTipificacaoDto';
import type { SubregraTipificacaoDto } from '../../../gen/types/SubregraTipificacaoDto';
import type { TipificacaoDto } from '../../../gen/types/TipificacaoDto';
import type { VersaoFaturaTipificacaoDto } from '../../../gen/types/VersaoFaturaTipificacaoDto';
import { plural } from '../../../lib/formato';
import { pode } from '../../../lib/permissoes';

const buscaSchema = z.object({
  /** Id da regra aberta no painel, ou `nova`. */
  regra: z.string().min(1).optional().catch(undefined),
  subregra: z.string().min(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

export const Route = createFileRoute('/_app/configuracoes/tipificacao')({
  validateSearch: buscaSchema,
  loader: async ({ context }) => {
    if (!pode(context.sessao, 'faturamento.ver')) return;
    // Sem lançar: a falha vira o aviso da própria tela, com "Tentar de novo".
    await context.queryClient.prefetchQuery(tipificacaoControllerListarQueryOptions());
  },
  head: () => ({ meta: [{ title: 'Tipificação · Configurações · One' }] }),
  component: PaginaTipificacao,
});

function PaginaTipificacao() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'faturamento.ver') ? <Tipificacao /> : <SemPermissao tela="Tipificação" />}
    </ConfiguracoesLayout>
  );
}

const colunaRegra = createDataTableColumnHelper<RegraTipificacaoDto>();
const colunaSub = createDataTableColumnHelper<SubregraTipificacaoDto>();
const POR_PAGINA = 10;
const clientes = (n: number) =>
  plural(n, { um: 'cliente', varios: 'clientes', nenhum: 'Nenhum cliente' });

const Fatura = ({ sim }: { sim: boolean }) =>
  sim ? <Etiqueta tom="sucesso">Fatura</Etiqueta> : <Etiqueta tom="erro">Não fatura</Etiqueta>;

/** O "fatura" em vigor e, se há versão programada que muda, a partir de quando. */
function FaturaEmVigor({
  sim,
  versoes,
  mesAtual,
}: {
  sim: boolean;
  versoes: VersaoFaturaTipificacaoDto[];
  mesAtual: string;
}) {
  const muda = versoes.find(
    (v) => v.vigenciaDesde !== null && v.vigenciaDesde > mesAtual && v.valor !== sim,
  );
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Fatura sim={sim} />
      {muda && (
        <Etiqueta tom="info">{`${muda.valor ? 'Fatura' : 'Não fatura'} a partir de ${mesAno(muda.vigenciaDesde ?? '')}`}</Etiqueta>
      )}
    </span>
  );
}

/** Mês atual e de quando a mudança do "fatura" pode valer, como a API devolve. */
type Vigencias = Pick<TipificacaoDto, 'mesAtual' | 'aPartirDeMinimo' | 'aPartirDeSugerido'>;

function Tipificacao() {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { sucesso } = useAvisos();
  const podeEditar = pode(sessao, 'faturamento.tipificacao.editar');
  const consulta = useQuery(tipificacaoControllerListarQueryOptions());
  const regras = consulta.data?.regras ?? [];
  const subregras = consulta.data?.subregras ?? [];
  const nomeRegra = useMemo(() => new Map(regras.map((r) => [r.id, r])), [regras]);
  const paginaRegras = usePaginaLocal(regras, POR_PAGINA);
  const paginaSubs = usePaginaLocal(subregras, POR_PAGINA);
  const ir = (b: Busca) => void navigate({ search: b, replace: true });
  const fechar = () => ir({});
  const recarregar = () =>
    queryClient.invalidateQueries({
      queryKey: tipificacaoControllerListarQueryOptions().queryKey,
    });
  const salvo = async (texto: string) => {
    await recarregar();
    sucesso(texto);
    fechar();
  };
  const versaoExcluida = async (texto: string) => {
    await recarregar();
    sucesso(texto);
  };
  const mesAtual = consulta.data?.mesAtual ?? '';

  const colunasRegras = useMemo(
    () => [
      colunaRegra.accessor('nome', {
        header: 'Regra',
        cell: (info) => (
          <span className="flex items-center gap-2">
            <BolinhaCor cor={info.row.original.cor} />
            <LinkDaLinha from={Route.fullPath} to="." search={{ regra: info.row.original.id }}>
              {info.getValue()}
            </LinkDaLinha>
            {info.row.original.padrao && <Etiqueta tom="info">Padrão</Etiqueta>}
            {!info.row.original.ativo && <Etiqueta tom="inativo">Inativa</Etiqueta>}
          </span>
        ),
      }),
      colunaRegra.accessor('descricao', {
        header: 'Descrição',
        cell: (info) => <span className="text-muted-foreground">{info.getValue() ?? '—'}</span>,
      }),
      colunaRegra.accessor('faturaSemSubregra', {
        header: 'Sem sub-regra',
        cell: (info) => (
          <FaturaEmVigor
            sim={info.getValue()}
            versoes={info.row.original.versoes}
            mesAtual={mesAtual}
          />
        ),
      }),
      colunaRegra.accessor('clientes', {
        header: () => <span className="block text-right">Usada por</span>,
        cell: (info) => <span className="block text-right">{clientes(info.getValue())}</span>,
      }),
    ],
    [mesAtual],
  );
  const colunasSubs = useMemo(
    () => [
      colunaSub.accessor('nome', {
        header: 'Sub-regra',
        cell: (info) => (
          <span className="flex items-center gap-2">
            <LinkDaLinha from={Route.fullPath} to="." search={{ subregra: info.row.original.id }}>
              {info.getValue()}
            </LinkDaLinha>
            {!info.row.original.ativo && <Etiqueta tom="inativo">Inativa</Etiqueta>}
          </span>
        ),
      }),
      colunaSub.accessor('regraId', {
        header: 'Regra',
        cell: (info) => {
          const regra = nomeRegra.get(info.getValue());
          return (
            <span className="flex items-center gap-2">
              <BolinhaCor cor={regra?.cor ?? null} />
              {regra?.nome ?? '—'}
            </span>
          );
        },
      }),
      colunaSub.accessor('fatura', {
        header: 'Fatura',
        cell: (info) => (
          <FaturaEmVigor
            sim={info.getValue()}
            versoes={info.row.original.versoes}
            mesAtual={mesAtual}
          />
        ),
      }),
      colunaSub.accessor('clientes', {
        header: () => <span className="block text-right">Usada por</span>,
        cell: (info) => <span className="block text-right">{clientes(info.getValue())}</span>,
      }),
    ],
    [nomeRegra, mesAtual],
  );

  const novo = (rotulo: string, search: Busca) =>
    podeEditar ? (
      <Button
        type="button"
        className={buttonClassName({ variant: 'secondary' })}
        onClick={() => ir(search)}
      >
        <Plus size={16} aria-hidden />
        {rotulo}
      </Button>
    ) : undefined;

  const regraAberta =
    busca.regra === 'nova' ? null : busca.regra ? nomeRegra.get(busca.regra) : undefined;
  const subAberta =
    busca.subregra === 'nova'
      ? null
      : busca.subregra
        ? subregras.find((s) => s.id === busca.subregra)
        : undefined;

  return (
    <div className="flex max-w-[880px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] leading-snug font-semibold">Tipificação</h1>
        <p className="text-muted-foreground">
          A tipificação diz se o laudo fatura. Cada cliente tem uma regra principal e linhas que
          levam o laudo a uma sub-regra (na aba Faturamento do cliente); cliente sem configuração
          fica na regra padrão. O "fatura" muda por vigência, a partir de uma competência aberta ou
          futura; nome, descrição e cor não mudam o cálculo.
        </p>
      </div>
      {consulta.isError && !consulta.data ? (
        <EstadoDoErro
          erro={consulta.error}
          oQue="a tipificação"
          onTentarDeNovo={() => void consulta.refetch()}
        />
      ) : (
        <>
          <Painel
            titulo="Regras"
            descricao="O laudo que nenhuma linha do cliente casou fica na regra principal, sem sub-regra, e fatura conforme esta coluna."
            acao={novo('Nova regra', { regra: 'nova' })}
            conteudoNaBorda
          >
            {consulta.data ? (
              <DataTable
                columns={colunasRegras}
                data={paginaRegras.itensDaPagina}
                getRowId={(r) => r.id}
                selectedRowId={busca.regra}
                emptyMessage="Nenhuma regra cadastrada."
              />
            ) : (
              <LinhasCarregando />
            )}
            {paginaRegras.precisaPaginar && (
              <Paginacao
                pagina={paginaRegras.pagina}
                porPagina={POR_PAGINA}
                total={paginaRegras.total}
                onIrPara={paginaRegras.irPara}
              />
            )}
          </Painel>
          <Painel
            titulo="Sub-regras"
            descricao="O resultado de uma linha da configuração do cliente. A sub-regra leva a regra dela e decide se o laudo fatura."
            acao={novo('Nova sub-regra', { subregra: 'nova' })}
            conteudoNaBorda
          >
            {consulta.data ? (
              <DataTable
                columns={colunasSubs}
                data={paginaSubs.itensDaPagina}
                getRowId={(s) => s.id}
                selectedRowId={busca.subregra}
                emptyMessage="Nenhuma sub-regra cadastrada."
              />
            ) : (
              <LinhasCarregando />
            )}
            {paginaSubs.precisaPaginar && (
              <Paginacao
                pagina={paginaSubs.pagina}
                porPagina={POR_PAGINA}
                total={paginaSubs.total}
                onIrPara={paginaSubs.irPara}
              />
            )}
          </Painel>
        </>
      )}
      {consulta.data && regraAberta !== undefined && (busca.regra !== 'nova' || podeEditar) && (
        <PainelRegra
          key={busca.regra}
          regra={regraAberta}
          vigencias={consulta.data}
          podeEditar={podeEditar}
          onFechar={fechar}
          onSalvo={salvo}
          onVersaoExcluida={versaoExcluida}
        />
      )}
      {consulta.data && subAberta !== undefined && (busca.subregra !== 'nova' || podeEditar) && (
        <PainelSubregra
          key={busca.subregra}
          subregra={subAberta}
          regras={regras}
          vigencias={consulta.data}
          podeEditar={podeEditar}
          onFechar={fechar}
          onSalvo={salvo}
          onVersaoExcluida={versaoExcluida}
        />
      )}
    </div>
  );
}

function LinhasCarregando() {
  return (
    <div className="flex flex-col gap-3 p-4">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;
const nome = z.string().trim().min(1, 'Informe o nome.').max(40, 'Até 40 caracteres.');
const descricao = z.string().max(500, 'Até 500 caracteres.');
const FALHA = 'Não foi possível salvar agora. Confira sua conexão e tente de novo.';
const AVISO_RECLASSIFICA =
  'O "fatura" muda a partir desta competência: os laudos das competências abertas desde ela são reclassificados; as anteriores, fechadas e travadas não mudam.';
const aPartirDe = z.string();

const schemaRegra = z.object({
  nome,
  descricao,
  cor: z
    .string()
    .refine((c) => c.trim() === '' || HEX.test(c.trim()), 'Use o formato #RRGGBB, como #DC2626.'),
  fatura: z.boolean(),
  ativo: z.boolean(),
  aPartirDe,
});

/** O "fatura" de uma regra ou sub-regra: versões, a de hoje e o pedido da mudança. */
type DonoFatura = { tipo: 'regras' | 'subregras'; id: string };

/** Grava o painel: o que só se audita (PUT) e, se o "fatura" mudou, a versão nova. */
async function salvarPainel<T extends { fatura: boolean; aPartirDe: string }>(
  dono: DonoFatura,
  iniciais: T,
  valores: T,
  /** O "fatura" que vale na competência escolhida: só muda se for diferente dele. */
  faturaNaCompetencia: boolean,
  alterar: () => Promise<unknown>,
) {
  const pedidos = pedidosDoPainel({ ...iniciais, fatura: faturaNaCompetencia }, valores);
  if (pedidos.dados) await alterar();
  if (pedidos.fatura)
    await tipificacaoControllerMudarFatura({
      path: { tipo: dono.tipo, id: dono.id },
      body: pedidos.fatura,
    }).unwrap();
  return pedidos;
}

function mensagemDoSalvo(
  oQue: 'Regra' | 'Sub-regra',
  pedidos: ReturnType<typeof pedidosDoPainel> | null,
) {
  if (!pedidos) return `${oQue} criada.`;
  if (pedidos.fatura)
    return `${oQue} salva; o "fatura" muda a partir de ${mesAno(pedidos.fatura.aPartirDe)}. Os laudos das competências abertas são reclassificados em seguida.`;
  return `${oQue} salva.`;
}

/** O "fatura" que vale na competência (a versão que a mudança substitui a partir dali). */
const faturaEm = (
  versoes: VersaoFaturaTipificacaoDto[],
  emVigor: boolean,
  aPartirDe: string,
  mesAtual: string,
) => novaVersaoEm(versoes, aPartirDe, mesAtual).base?.valor ?? emVigor;

/** As competências do "Vale a partir de": abertas ou futuras, até um ano à frente. */
const competenciasDe = (v: Vigencias) =>
  opcoesAPartirDe(v.aPartirDeMinimo, v.mesAtual).map((c) => ({ valor: c, rotulo: mesAno(c) }));

/** Histórico de vigências do "fatura", com a exclusão da versão programada. */
function HistoricoFatura({
  dono,
  versoes,
  mesAtual,
  podeEditar,
  rotulo,
  onVersaoExcluida,
}: {
  dono: DonoFatura;
  versoes: VersaoFaturaTipificacaoDto[];
  mesAtual: string;
  podeEditar: boolean;
  rotulo: string;
  onVersaoExcluida: (texto: string) => Promise<void>;
}) {
  return (
    <HistoricoVigencias
      versoes={versoes}
      mesAtual={mesAtual}
      vazio="Nenhuma versão."
      descrever={(v) => `${rotulo}: ${v.valor ? 'fatura' : 'não fatura'}`}
      onExcluir={
        podeEditar
          ? async (v) => {
              await tipificacaoControllerRemoverFatura({
                path: { tipo: dono.tipo, id: dono.id, versaoId: v.id },
              }).unwrap();
              await onVersaoExcluida(
                `Versão de ${mesAno(v.vigenciaDesde ?? '')} excluída. Os laudos das competências abertas são reclassificados em seguida.`,
              );
            }
          : undefined
      }
    />
  );
}

type PropsPainel = {
  vigencias: Vigencias;
  podeEditar: boolean;
  onFechar: () => void;
  onSalvo: (texto: string) => Promise<void>;
  onVersaoExcluida: (texto: string) => Promise<void>;
};

function PainelRegra({
  regra,
  vigencias,
  podeEditar,
  onFechar,
  onSalvo,
  onVersaoExcluida,
}: PropsPainel & {
  /** Nula = nova. */
  regra: RegraTipificacaoDto | null;
}) {
  const [erro, setErro] = useState<string>();
  const iniciais = {
    nome: regra?.nome ?? '',
    descricao: regra?.descricao ?? '',
    cor: regra?.cor ?? '',
    fatura: regra
      ? faturaEm(
          regra.versoes,
          regra.faturaSemSubregra,
          vigencias.aPartirDeSugerido,
          vigencias.mesAtual,
        )
      : true,
    ativo: regra?.ativo ?? true,
    aPartirDe: vigencias.aPartirDeSugerido,
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schemaRegra },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      const body = {
        nome: value.nome.trim(),
        descricao: value.descricao.trim() || null,
        cor: value.cor.trim().toLowerCase() || null,
        ativo: value.ativo,
      };
      try {
        if (!regra) {
          await tipificacaoControllerCriarRegra({
            body: { ...body, faturaSemSubregra: value.fatura },
          }).unwrap();
          await onSalvo(mensagemDoSalvo('Regra', null));
          return;
        }
        const pedidos = await salvarPainel(
          { tipo: 'regras', id: regra.id },
          iniciais,
          value,
          faturaEm(regra.versoes, regra.faturaSemSubregra, value.aPartirDe, vigencias.mesAtual),
          () => tipificacaoControllerAlterarRegra({ path: { id: regra.id }, body }).unwrap(),
        );
        await onSalvo(mensagemDoSalvo('Regra', pedidos));
      } catch (falha) {
        setErro(mensagemDaApi(falha, FALHA));
      }
    },
  });
  const alterado = useAlterado(form, iniciais);
  const fatura = useStore(form.store, (s) => s.values.fatura);
  const aPartirDeEscolhido = useStore(form.store, (s) => s.values.aPartirDe);
  const titulo = regra ? regra.nome : 'Nova regra';
  const historico = regra && (
    <HistoricoFatura
      dono={{ tipo: 'regras', id: regra.id }}
      versoes={regra.versoes}
      mesAtual={vigencias.mesAtual}
      podeEditar={podeEditar}
      rotulo="Sem sub-regra"
      onVersaoExcluida={onVersaoExcluida}
    />
  );

  if (!podeEditar && regra)
    return (
      <PainelLateral titulo={titulo} onFechar={onFechar}>
        <div className="flex flex-col gap-4 p-4">
          <CampoSomenteLeitura label="Nome" value={regra.nome} />
          <CampoSomenteLeitura label="Descrição" value={regra.descricao ?? '—'} />
          <CampoSomenteLeitura
            label="Sem sub-regra (em vigor)"
            value={regra.faturaSemSubregra ? 'Fatura' : 'Não fatura'}
          />
          <CampoSomenteLeitura label="Usada por" value={clientes(regra.clientes)} />
          {historico}
        </div>
      </PainelLateral>
    );

  return (
    <PainelLateral titulo={titulo} alterado={alterado} onFechar={onFechar}>
      <div className="flex flex-col gap-6 p-4">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          {regra?.padrao && (
            <Alerta tom="info" role="note">
              Regra padrão: vale para o cliente sem configuração de tipificação.
            </Alerta>
          )}
          <form.AppField name="nome">
            {(field) => (
              <field.TextField label="Nome" placeholder="Ex.: NC" autoComplete="off" required />
            )}
          </form.AppField>
          <form.AppField name="descricao">
            {(field) => (
              <field.TextField
                label="Descrição"
                placeholder="Ex.: Clínica não consolidada"
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.AppField name="cor">
            {(field) => (
              <field.CorField description="Cor do selo nas telas." className="basis-full" />
            )}
          </form.AppField>
          {regra && (
            <form.AppField
              name="aPartirDe"
              listeners={{
                // O "fatura" que vale na competência escolhida: mudar parte dele.
                onChange: ({ value }) =>
                  form.setFieldValue(
                    'fatura',
                    faturaEm(regra.versoes, regra.faturaSemSubregra, value, vigencias.mesAtual),
                  ),
              }}
            >
              {(field) => (
                <field.SelectField
                  label="Vale a partir de (o fatura)"
                  required
                  placeholder="Escolha a competência"
                  opcoes={competenciasDe(vigencias)}
                  description="O fatura abaixo é o que vale nessa competência; mudar vale a partir dela. Nome, descrição e cor não dependem da competência."
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="fatura">
            {(field) => (
              <field.InterruptorField
                label="Fatura sem sub-regra"
                description={
                  regra
                    ? 'O laudo que nenhuma linha do cliente casou, e fica só nesta regra, fatura. Mudar vale a partir de uma competência.'
                    : 'O laudo que nenhuma linha do cliente casou, e fica só nesta regra, fatura. Vale desde a primeira competência aberta.'
                }
              />
            )}
          </form.AppField>
          {regra &&
            fatura !==
              faturaEm(
                regra.versoes,
                regra.faturaSemSubregra,
                aPartirDeEscolhido,
                vigencias.mesAtual,
              ) && (
              <div className="flex flex-col gap-1 border-l-2 pl-3 text-[13px]">
                <p aria-live="polite">
                  {novaVersaoEm(regra.versoes, aPartirDeEscolhido, vigencias.mesAtual).texto}
                </p>
                <p className="text-muted-foreground">{AVISO_RECLASSIFICA}</p>
              </div>
            )}
          <form.AppField name="ativo">
            {(field) => (
              <field.InterruptorField
                label="Ativa"
                description="Inativa some das listas de escolha, mas continua valendo onde já está."
              />
            )}
          </form.AppField>
          {erro && <Alerta tom="erro">{erro}</Alerta>}
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar regra"
              editando={Boolean(regra)}
              onCancelar={onFechar}
            />
          </form.AppForm>
        </form>
        {historico}
      </div>
    </PainelLateral>
  );
}

const schemaSub = z.object({
  regraId: z.string().min(1, 'Escolha a regra.'),
  nome,
  descricao,
  fatura: z.boolean(),
  ativo: z.boolean(),
  aPartirDe,
});

function PainelSubregra({
  subregra,
  regras,
  vigencias,
  podeEditar,
  onFechar,
  onSalvo,
  onVersaoExcluida,
}: PropsPainel & {
  subregra: SubregraTipificacaoDto | null;
  regras: RegraTipificacaoDto[];
}) {
  const [erro, setErro] = useState<string>();
  const iniciais = {
    regraId: subregra?.regraId ?? '',
    nome: subregra?.nome ?? '',
    descricao: subregra?.descricao ?? '',
    fatura: subregra
      ? faturaEm(subregra.versoes, subregra.fatura, vigencias.aPartirDeSugerido, vigencias.mesAtual)
      : true,
    ativo: subregra?.ativo ?? true,
    aPartirDe: vigencias.aPartirDeSugerido,
  };
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: schemaSub },
    onSubmit: async ({ value }) => {
      setErro(undefined);
      const body = {
        regraId: value.regraId,
        nome: value.nome.trim(),
        descricao: value.descricao.trim() || null,
        ativo: value.ativo,
      };
      try {
        if (!subregra) {
          await tipificacaoControllerCriarSubregra({
            body: { ...body, fatura: value.fatura },
          }).unwrap();
          await onSalvo(mensagemDoSalvo('Sub-regra', null));
          return;
        }
        const pedidos = await salvarPainel(
          { tipo: 'subregras', id: subregra.id },
          iniciais,
          value,
          faturaEm(subregra.versoes, subregra.fatura, value.aPartirDe, vigencias.mesAtual),
          () => tipificacaoControllerAlterarSubregra({ path: { id: subregra.id }, body }).unwrap(),
        );
        await onSalvo(mensagemDoSalvo('Sub-regra', pedidos));
      } catch (falha) {
        setErro(mensagemDaApi(falha, FALHA));
      }
    },
  });
  const alterado = useAlterado(form, iniciais);
  const fatura = useStore(form.store, (s) => s.values.fatura);
  const aPartirDeEscolhido = useStore(form.store, (s) => s.values.aPartirDe);
  const titulo = subregra ? subregra.nome : 'Nova sub-regra';
  const regra = regras.find((r) => r.id === subregra?.regraId);
  const historico = subregra && (
    <HistoricoFatura
      dono={{ tipo: 'subregras', id: subregra.id }}
      versoes={subregra.versoes}
      mesAtual={vigencias.mesAtual}
      podeEditar={podeEditar}
      rotulo="Fatura"
      onVersaoExcluida={onVersaoExcluida}
    />
  );

  if (!podeEditar && subregra)
    return (
      <PainelLateral titulo={titulo} onFechar={onFechar}>
        <div className="flex flex-col gap-4 p-4">
          <CampoSomenteLeitura label="Regra" value={regra?.nome ?? '—'} />
          <CampoSomenteLeitura label="Nome" value={subregra.nome} />
          <CampoSomenteLeitura label="Descrição" value={subregra.descricao ?? '—'} />
          <CampoSomenteLeitura label="Fatura (em vigor)" value={subregra.fatura ? 'Sim' : 'Não'} />
          <CampoSomenteLeitura label="Usada por" value={clientes(subregra.clientes)} />
          {historico}
        </div>
      </PainelLateral>
    );

  return (
    <PainelLateral titulo={titulo} alterado={alterado} onFechar={onFechar}>
      <div className="flex flex-col gap-6 p-4">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.AppField name="regraId">
            {(field) => (
              <field.SelectField
                label="Regra"
                placeholder="Escolha a regra"
                required
                opcoes={regras.map((r) => ({ valor: r.id, rotulo: r.nome, cor: r.cor }))}
                description={
                  subregra
                    ? 'Trocar a regra reclassifica os laudos das competências abertas.'
                    : undefined
                }
              />
            )}
          </form.AppField>
          <form.AppField name="nome">
            {(field) => (
              <field.TextField label="Nome" placeholder="Ex.: NC-NF" autoComplete="off" required />
            )}
          </form.AppField>
          <form.AppField name="descricao">
            {(field) => (
              <field.TextField label="Descrição" placeholder="Ex.: Não fatura" autoComplete="off" />
            )}
          </form.AppField>
          {subregra && (
            <form.AppField
              name="aPartirDe"
              listeners={{
                // O "fatura" que vale na competência escolhida: mudar parte dele.
                onChange: ({ value }) =>
                  form.setFieldValue(
                    'fatura',
                    faturaEm(subregra.versoes, subregra.fatura, value, vigencias.mesAtual),
                  ),
              }}
            >
              {(field) => (
                <field.SelectField
                  label="Vale a partir de (o fatura)"
                  required
                  placeholder="Escolha a competência"
                  opcoes={competenciasDe(vigencias)}
                  description="O fatura abaixo é o que vale nessa competência; mudar vale a partir dela. Nome, descrição e cor não dependem da competência."
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="fatura">
            {(field) => (
              <field.InterruptorField
                label="Fatura"
                description={
                  subregra
                    ? 'O laudo nesta sub-regra entra no faturamento do cliente. Mudar vale a partir de uma competência.'
                    : 'O laudo nesta sub-regra entra no faturamento do cliente. Vale desde a primeira competência aberta.'
                }
              />
            )}
          </form.AppField>
          {subregra &&
            fatura !==
              faturaEm(
                subregra.versoes,
                subregra.fatura,
                aPartirDeEscolhido,
                vigencias.mesAtual,
              ) && (
              <div className="flex flex-col gap-1 border-l-2 pl-3 text-[13px]">
                <p aria-live="polite">
                  {novaVersaoEm(subregra.versoes, aPartirDeEscolhido, vigencias.mesAtual).texto}
                </p>
                <p className="text-muted-foreground">{AVISO_RECLASSIFICA}</p>
              </div>
            )}
          <form.AppField name="ativo">
            {(field) => (
              <field.InterruptorField
                label="Ativa"
                description="Inativa some das listas de escolha, mas continua valendo onde já está."
              />
            )}
          </form.AppField>
          {erro && <Alerta tom="erro">{erro}</Alerta>}
          <form.AppForm>
            <RodapePainel
              rotuloCriar="Criar sub-regra"
              editando={Boolean(subregra)}
              onCancelar={onFechar}
            />
          </form.AppForm>
        </form>
        {historico}
      </div>
    </PainelLateral>
  );
}
