import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
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
import { tipificacaoControllerListarQueryOptions } from '../../../gen/hooks/useTipificacaoControllerListar';
import type { RegraTipificacaoDto } from '../../../gen/types/RegraTipificacaoDto';
import type { SubregraTipificacaoDto } from '../../../gen/types/SubregraTipificacaoDto';
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
  const salvo = async (texto: string) => {
    await queryClient.invalidateQueries({
      queryKey: tipificacaoControllerListarQueryOptions().queryKey,
    });
    sucesso(texto);
    fechar();
  };

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
        cell: (info) => <Fatura sim={info.getValue()} />,
      }),
      colunaRegra.accessor('clientes', {
        header: () => <span className="block text-right">Usada por</span>,
        cell: (info) => <span className="block text-right">{clientes(info.getValue())}</span>,
      }),
    ],
    [],
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
        cell: (info) => <Fatura sim={info.getValue()} />,
      }),
      colunaSub.accessor('clientes', {
        header: () => <span className="block text-right">Usada por</span>,
        cell: (info) => <span className="block text-right">{clientes(info.getValue())}</span>,
      }),
    ],
    [nomeRegra],
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
          fica na regra padrão. Mudar aqui reclassifica os laudos das competências abertas.
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
          podeEditar={podeEditar}
          onFechar={fechar}
          onSalvo={(nova) => salvo(nova ? 'Regra criada.' : 'Regra salva.')}
        />
      )}
      {consulta.data && subAberta !== undefined && (busca.subregra !== 'nova' || podeEditar) && (
        <PainelSubregra
          key={busca.subregra}
          subregra={subAberta}
          regras={regras}
          podeEditar={podeEditar}
          onFechar={fechar}
          onSalvo={(nova) => salvo(nova ? 'Sub-regra criada.' : 'Sub-regra salva.')}
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
  'Salvar reclassifica os laudos das competências abertas; as fechadas e travadas não mudam.';

const schemaRegra = z.object({
  nome,
  descricao,
  cor: z
    .string()
    .refine((c) => c.trim() === '' || HEX.test(c.trim()), 'Use o formato #RRGGBB, como #DC2626.'),
  faturaSemSubregra: z.boolean(),
  ativo: z.boolean(),
});

function PainelRegra({
  regra,
  podeEditar,
  onFechar,
  onSalvo,
}: {
  /** Nula = nova. */
  regra: RegraTipificacaoDto | null;
  podeEditar: boolean;
  onFechar: () => void;
  onSalvo: (nova: boolean) => Promise<void>;
}) {
  const [erro, setErro] = useState<string>();
  const iniciais = {
    nome: regra?.nome ?? '',
    descricao: regra?.descricao ?? '',
    cor: regra?.cor ?? '',
    faturaSemSubregra: regra?.faturaSemSubregra ?? true,
    ativo: regra?.ativo ?? true,
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
        faturaSemSubregra: value.faturaSemSubregra,
        ativo: value.ativo,
      };
      try {
        if (regra)
          await tipificacaoControllerAlterarRegra({ path: { id: regra.id }, body }).unwrap();
        else await tipificacaoControllerCriarRegra({ body }).unwrap();
        await onSalvo(!regra);
      } catch (falha) {
        setErro(mensagemDaApi(falha, FALHA));
      }
    },
  });
  const alterado = useAlterado(form, iniciais);
  const titulo = regra ? regra.nome : 'Nova regra';

  if (!podeEditar && regra)
    return (
      <PainelLateral titulo={titulo} onFechar={onFechar}>
        <div className="flex flex-col gap-4 p-4">
          <CampoSomenteLeitura label="Nome" value={regra.nome} />
          <CampoSomenteLeitura label="Descrição" value={regra.descricao ?? '—'} />
          <CampoSomenteLeitura
            label="Sem sub-regra"
            value={regra.faturaSemSubregra ? 'Fatura' : 'Não fatura'}
          />
          <CampoSomenteLeitura label="Usada por" value={clientes(regra.clientes)} />
        </div>
      </PainelLateral>
    );

  return (
    <PainelLateral titulo={titulo} alterado={alterado} onFechar={onFechar}>
      <form
        noValidate
        className="flex flex-col gap-4 p-4"
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
            <field.TextField
              label="Cor"
              placeholder="#DC2626"
              autoComplete="off"
              description="Cor do selo nas telas."
            />
          )}
        </form.AppField>
        <form.AppField name="faturaSemSubregra">
          {(field) => (
            <field.CheckboxField
              label="Fatura sem sub-regra"
              description="O laudo que nenhuma linha do cliente casou, e fica só nesta regra, fatura."
            />
          )}
        </form.AppField>
        <form.AppField name="ativo">
          {(field) => (
            <field.CheckboxField
              label="Ativa"
              description="Inativa some das listas de escolha, mas continua valendo onde já está."
            />
          )}
        </form.AppField>
        <p className="text-muted-foreground text-[13px]">{AVISO_RECLASSIFICA}</p>
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <form.AppForm>
          <RodapePainel rotuloCriar="Criar regra" editando={Boolean(regra)} onCancelar={onFechar} />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}

const schemaSub = z.object({
  regraId: z.string().min(1, 'Escolha a regra.'),
  nome,
  descricao,
  fatura: z.boolean(),
  ativo: z.boolean(),
});

function PainelSubregra({
  subregra,
  regras,
  podeEditar,
  onFechar,
  onSalvo,
}: {
  subregra: SubregraTipificacaoDto | null;
  regras: RegraTipificacaoDto[];
  podeEditar: boolean;
  onFechar: () => void;
  onSalvo: (nova: boolean) => Promise<void>;
}) {
  const [erro, setErro] = useState<string>();
  const iniciais = {
    regraId: subregra?.regraId ?? '',
    nome: subregra?.nome ?? '',
    descricao: subregra?.descricao ?? '',
    fatura: subregra?.fatura ?? true,
    ativo: subregra?.ativo ?? true,
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
        fatura: value.fatura,
        ativo: value.ativo,
      };
      try {
        if (subregra)
          await tipificacaoControllerAlterarSubregra({ path: { id: subregra.id }, body }).unwrap();
        else await tipificacaoControllerCriarSubregra({ body }).unwrap();
        await onSalvo(!subregra);
      } catch (falha) {
        setErro(mensagemDaApi(falha, FALHA));
      }
    },
  });
  const alterado = useAlterado(form, iniciais);
  const titulo = subregra ? subregra.nome : 'Nova sub-regra';
  const regra = regras.find((r) => r.id === subregra?.regraId);

  if (!podeEditar && subregra)
    return (
      <PainelLateral titulo={titulo} onFechar={onFechar}>
        <div className="flex flex-col gap-4 p-4">
          <CampoSomenteLeitura label="Regra" value={regra?.nome ?? '—'} />
          <CampoSomenteLeitura label="Nome" value={subregra.nome} />
          <CampoSomenteLeitura label="Descrição" value={subregra.descricao ?? '—'} />
          <CampoSomenteLeitura label="Fatura" value={subregra.fatura ? 'Sim' : 'Não'} />
          <CampoSomenteLeitura label="Usada por" value={clientes(subregra.clientes)} />
        </div>
      </PainelLateral>
    );

  return (
    <PainelLateral titulo={titulo} alterado={alterado} onFechar={onFechar}>
      <form
        noValidate
        className="flex flex-col gap-4 p-4"
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
        <form.AppField name="fatura">
          {(field) => (
            <field.CheckboxField
              label="Fatura"
              description="O laudo nesta sub-regra entra no faturamento do cliente."
            />
          )}
        </form.AppField>
        <form.AppField name="ativo">
          {(field) => (
            <field.CheckboxField
              label="Ativa"
              description="Inativa some das listas de escolha, mas continua valendo onde já está."
            />
          )}
        </form.AppField>
        <p className="text-muted-foreground text-[13px]">{AVISO_RECLASSIFICA}</p>
        {erro && <Alerta tom="erro">{erro}</Alerta>}
        <form.AppForm>
          <RodapePainel
            rotuloCriar="Criar sub-regra"
            editando={Boolean(subregra)}
            onCancelar={onFechar}
          />
        </form.AppForm>
      </form>
    </PainelLateral>
  );
}
