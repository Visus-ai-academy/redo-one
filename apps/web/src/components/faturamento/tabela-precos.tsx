import { Button } from '@base-ui/react/button';
import { ArrowLeft, DownloadSimple, Plus, UploadSimple } from '@phosphor-icons/react';
import { useStore } from '@tanstack/react-form';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { z } from 'zod';

import { ResponseError } from '../../gen/.kubb/client';
import { precosControllerAlterar } from '../../gen/clients/precosControllerAlterar';
import { precosControllerEncerrar } from '../../gen/clients/precosControllerEncerrar';
import { precosControllerExportar } from '../../gen/clients/precosControllerExportar';
import { precosControllerImportar } from '../../gen/clients/precosControllerImportar';
import { precosControllerIncluir } from '../../gen/clients/precosControllerIncluir';
import { precosControllerHistoricoQueryOptions } from '../../gen/hooks/usePrecosControllerHistorico';
import { precosControllerListarQueryOptions } from '../../gen/hooks/usePrecosControllerListar';
import { precosControllerOpcoesQueryOptions } from '../../gen/hooks/usePrecosControllerOpcoes';
import type { ItemPrecoDto } from '../../gen/types/ItemPrecoDto';
import type { OpcoesPrecoDto } from '../../gen/types/OpcoesPrecoDto';
import type { TabelaPrecosDto } from '../../gen/types/TabelaPrecosDto';
import { dataDeBrasilia } from '../../lib/datas';
import { moeda, plural } from '../../lib/formato';
import { AjudaContextual } from '../ajuda/AjudaContextual';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { CampoBusca } from '../busca/CampoBusca';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { Dialogo } from '../dialogo/Dialogo';
import { AbaComErro } from '../distribuicao/estados';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { useAppForm } from '../form/form';
import { RequiredLegend } from '../form/RequiredLegend';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { useAlterado, useInformarAlterado } from '../painel/fechamento';
import { Select } from '../select/Select';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { useAvisos } from '../toast/use-avisos';
import { mesAno } from './competencias';
import {
  baixarArquivo,
  corpoDoPreco,
  numeroPtBr,
  opcoesAPartirDe,
  ROTULO_COND,
  textoDaFaixa,
  textoDaVigencia,
  type ValoresPreco,
  valoresDoPreco,
} from './precos';

export type TabelaPrecosProps = {
  /** Preços do cliente (ou unidade) ou tabela padrão do contratado. */
  tipo: 'cliente' | 'contratado';
  donoId: string;
  /** `faturamento.precos.editar`; sem ela, só leitura. */
  podeEditar: boolean;
  /** Linhas por página: 10 numa página, 10 também no painel (a tabela rola por dentro). */
  porPagina?: number;
  /** Avisa quando o preço aberto tem algo digitado e não salvo. */
  onAlterado?: (alterado: boolean) => void;
};

type Aberto = { modo: 'novo' } | { modo: 'editar'; item: ItemPrecoDto } | null;

const coluna = createDataTableColumnHelper<ItemPrecoDto>();
const COLUNAS = [
  coluna.display({
    id: 'arranjo',
    header: 'Arranjo',
    cell: ({ row: { original: p } }) => (
      <span className="flex flex-col">
        <span className="font-medium">
          {p.nomes.modalidade} {p.nomes.especialidade}
        </span>
        <span className="text-muted-foreground text-[13px]">
          {p.nomes.categoria}, {p.nomes.prioridade.toLowerCase()}
        </span>
      </span>
    ),
  }),
  coluna.accessor((p) => textoDaFaixa(p.faixaInicio, p.faixaFim), {
    id: 'faixa',
    header: 'Faixa',
    cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
  }),
  coluna.accessor('valor', {
    header: () => <span className="block text-right">Valor</span>,
    cell: (c) => (
      <span className="block text-right whitespace-nowrap tabular-nums">{moeda(c.getValue())}</span>
    ),
  }),
  coluna.display({
    id: 'vigencia',
    header: 'Vigência',
    cell: ({ row: { original: p } }) => (
      <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
        {textoDaVigencia(p.vigenciaDesde, p.vigenciaAte)}
        {!p.emVigor && <Etiqueta tom="info">Programado</Etiqueta>}
        {p.duplicado && <Etiqueta tom="atencao">Duplicado</Etiqueta>}
      </span>
    ),
  }),
];

/** Chave das consultas da tabela (para recarregar depois de mudar). */
const chaveDoDono = (tipo: string, donoId: string) => [
  { url: '/faturamento/precos/:tipo/:donoId', params: { tipo, donoId } },
];

/**
 * Tabela de preços por arranjo, a mesma no cliente (aba Preços) e na tabela padrão do contratado:
 * lista com busca e paginação, e o preço aberto no lugar (formulário com "Vale a partir de" e o
 * histórico de vigências do arranjo). Nada se sobrescreve: alterar e encerrar criam versões.
 */
export function TabelaPrecos({
  tipo,
  donoId,
  podeEditar,
  porPagina = 10,
  onAlterado,
}: TabelaPrecosProps) {
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState<Aberto>(null);
  const [importando, setImportando] = useState(false);
  const avisos = useAvisos();
  const [erroExportar, setErroExportar] = useState<string>();

  useEffect(() => {
    const espera = setTimeout(() => {
      setBusca(termo.trim());
      setPagina(1);
    }, 300);
    return () => clearTimeout(espera);
  }, [termo]);

  const tabela = useQuery({
    ...precosControllerListarQueryOptions({
      path: { tipo, donoId },
      query: { pagina, porPagina, ...(busca ? { busca } : {}) },
    }),
    placeholderData: keepPreviousData,
  });
  const opcoes = useQuery(precosControllerOpcoesQueryOptions());

  if (tabela.isError || opcoes.isError)
    return (
      <AbaComErro
        onTentarDeNovo={() => {
          void tabela.refetch();
          void opcoes.refetch();
        }}
      >
        Não foi possível carregar os preços agora.
      </AbaComErro>
    );
  if (!tabela.data || !opcoes.data) return <CamposCarregando quantidade={4} />;
  const dados = tabela.data;

  if (aberto)
    return (
      <EditorPreco
        tipo={tipo}
        donoId={donoId}
        aberto={aberto}
        tabela={dados}
        opcoes={opcoes.data}
        podeEditar={podeEditar}
        onAlterado={onAlterado}
        onVoltar={() => {
          setAberto(null);
          onAlterado?.(false);
        }}
      />
    );

  const exportar = async () => {
    setErroExportar(undefined);
    try {
      const r = await precosControllerExportar({ path: { tipo, donoId } }).unwrap();
      baixarArquivo(r.nomeArquivo, r.conteudo);
    } catch (e) {
      setErroExportar(mensagemDaApi(e, 'Não foi possível exportar agora. Tente de novo.'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {dados.dono.principal && (
        <Alerta tom="info">
          Estes são os preços desta unidade. O arranjo que faltar aqui é cobrado pela tabela de{' '}
          {dados.dono.principal.nome}, o cliente principal, e depois pela tabela padrão do
          contratado.
        </Alerta>
      )}
      {erroExportar && <Alerta tom="erro">{erroExportar}</Alerta>}
      <div className="flex flex-wrap items-center gap-2">
        <CampoBusca
          rotulo="Buscar preços"
          placeholder="Buscar modalidade, especialidade, categoria…"
          valor={termo}
          onMudar={setTermo}
          className="min-w-[220px] flex-1"
        />
        <Button
          type="button"
          onClick={() => void exportar()}
          className={buttonClassName({ variant: 'secondary' })}
        >
          <DownloadSimple size={16} aria-hidden />
          Exportar planilha
        </Button>
        {podeEditar && (
          <>
            <Button
              type="button"
              onClick={() => setImportando(true)}
              className={buttonClassName({ variant: 'secondary' })}
            >
              <UploadSimple size={16} aria-hidden />
              Importar planilha
            </Button>
            <Button
              type="button"
              onClick={() => setAberto({ modo: 'novo' })}
              className={buttonClassName({})}
            >
              <Plus size={16} aria-hidden />
              Incluir preço
            </Button>
          </>
        )}
      </div>
      <DataTable
        columns={COLUNAS}
        data={dados.itens}
        getRowId={(p) => p.id}
        onRowClick={(item) => setAberto({ modo: 'editar', item })}
        recarregando={tabela.isFetching}
        emptyMessage={
          busca
            ? 'Nenhum preço com essa busca.'
            : dados.dono.principal
              ? `Nenhum preço próprio. Os laudos usam a tabela de ${dados.dono.principal.nome}.`
              : tipo === 'cliente'
                ? 'Nenhum preço cadastrado. Os laudos usam a tabela padrão do contratado.'
                : 'Nenhum preço cadastrado nesta tabela padrão.'
        }
        className="max-h-[60vh]"
      />
      {dados.total > 0 && (
        <Paginacao pagina={pagina} porPagina={porPagina} total={dados.total} onIrPara={setPagina} />
      )}
      {importando && (
        <ImportarPlanilha
          tipo={tipo}
          donoId={donoId}
          tabela={dados}
          onFechar={() => setImportando(false)}
          onImportado={(texto) => {
            setImportando(false);
            avisos.sucesso(texto);
          }}
        />
      )}
    </div>
  );
}

const esquema = z
  .object({
    modalidadeId: z.string().min(1, 'Escolha a modalidade.'),
    especialidadeId: z.string().min(1, 'Escolha a especialidade.'),
    categoriaId: z.string().min(1, 'Escolha a categoria.'),
    prioridadeId: z.string().min(1, 'Escolha a prioridade.'),
    faixaInicio: z.string(),
    faixaFim: z.string(),
    condVolume: z.enum(['MOD', 'MOD_ESP', 'MOD_ESP_CAT', 'TOTAL']),
    valor: z.string().min(1, 'Informe o valor.'),
    aPartirDe: z.string().min(1, 'Escolha a competência a partir da qual o preço vale.'),
  })
  .superRefine((v, ctx) => {
    const valor = numeroPtBr(v.valor, 2);
    if (v.valor.trim() && valor === null)
      ctx.addIssue({
        code: 'custom',
        path: ['valor'],
        message: 'Use vírgula nos centavos, como 1.200,50.',
      });
    else if (v.valor.trim() && !((valor ?? 0) > 0))
      ctx.addIssue({
        code: 'custom',
        path: ['valor'],
        message: 'O valor tem de ser maior que zero.',
      });
    const ini = v.faixaInicio.trim() ? numeroPtBr(v.faixaInicio, 0) : null;
    const fim = v.faixaFim.trim() ? numeroPtBr(v.faixaFim, 0) : null;
    for (const [campo, texto, n] of [
      ['faixaInicio', v.faixaInicio, ini],
      ['faixaFim', v.faixaFim, fim],
    ] as const)
      if (texto.trim() && n === null)
        ctx.addIssue({
          code: 'custom',
          path: [campo],
          message: 'Use um número inteiro (ex.: 300 ou 1.000).',
        });
    if (ini !== null && fim !== null && fim < ini)
      ctx.addIssue({
        code: 'custom',
        path: ['faixaFim'],
        message: 'O fim da faixa tem de ser maior ou igual ao início.',
      });
  });

/** O preço aberto: formulário (novo ou alteração) e o histórico de vigências do arranjo. */
function EditorPreco({
  tipo,
  donoId,
  aberto,
  tabela,
  opcoes,
  podeEditar,
  onAlterado,
  onVoltar,
}: {
  tipo: 'cliente' | 'contratado';
  donoId: string;
  aberto: NonNullable<Aberto>;
  tabela: TabelaPrecosDto;
  opcoes: OpcoesPrecoDto;
  podeEditar: boolean;
  onAlterado?: (alterado: boolean) => void;
  onVoltar: () => void;
}) {
  const item = aberto.modo === 'editar' ? aberto.item : undefined;
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { erro, tentar } = useErroDoPainel();
  const idTitulo = useId();
  const iniciais = useMemo(
    () => valoresDoPreco(item, tabela.aPartirDeSugerido),
    [item, tabela.aPartirDeSugerido],
  );
  const recarregar = () => queryClient.invalidateQueries({ queryKey: chaveDoDono(tipo, donoId) });
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquema },
    onSubmit: ({ value }) =>
      tentar(async () => {
        const body = corpoDoPreco(value as ValoresPreco);
        if (item)
          await precosControllerAlterar({
            path: { tipo, donoId, precoId: item.id },
            body,
          }).unwrap();
        else await precosControllerIncluir({ path: { tipo, donoId }, body }).unwrap();
        await recarregar();
        avisos.sucesso(
          item
            ? `Preço alterado a partir de ${mesAno(body.aPartirDe)}.`
            : `Preço incluído a partir de ${mesAno(body.aPartirDe)}.`,
        );
        onVoltar();
      }),
  });
  const alterado = useAlterado(form, iniciais);
  useInformarAlterado(alterado);
  useEffect(() => onAlterado?.(alterado), [alterado, onAlterado]);
  const aPartirDe = useStore(form.store, (s) => s.values.aPartirDe);
  const temFaixa = useStore(form.store, (s) => Boolean(s.values.faixaInicio || s.values.faixaFim));

  const lista = (l: { id: string; nome: string }[]) =>
    l.map((o) => ({ valor: o.id, rotulo: o.nome }));
  const competencias = opcoesAPartirDe(tabela.aPartirDeMinimo, tabela.mesAtual).map((c) => ({
    valor: c,
    rotulo: mesAno(c),
  }));
  const somenteLeitura = !podeEditar;
  const titulo = item
    ? [
        item.nomes.modalidade,
        item.nomes.especialidade,
        item.nomes.categoria,
        item.nomes.prioridade,
      ].join(' / ')
    : 'Novo preço';
  const apagaDeVez = Boolean(
    item?.vigenciaDesde && item.vigenciaDesde > tabela.mesAtual && item.vigenciaDesde >= aPartirDe,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          onClick={onVoltar}
          className={buttonClassName({ variant: 'ghost', className: 'self-start' })}
        >
          <ArrowLeft size={16} aria-hidden />
          Voltar para a tabela
        </Button>
        <h4 id={idTitulo} className="text-base font-semibold">
          {titulo}
        </h4>
        {item && (
          <p className="text-muted-foreground tabular-nums">
            {moeda(item.valor)}, {textoDaFaixa(item.faixaInicio, item.faixaFim).toLowerCase()},{' '}
            {textoDaVigencia(item.vigenciaDesde, item.vigenciaAte).toLowerCase()}
          </p>
        )}
      </div>

      {podeEditar && (
        <form
          aria-labelledby={idTitulo}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex max-w-[640px] flex-col gap-4"
        >
          {item && (
            <p className="text-muted-foreground text-[13px]">
              O preço atual não muda: ele vale até a competência anterior e o novo começa na
              competência escolhida.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="modalidadeId">
              {(f) => (
                <f.SelectField
                  label="Modalidade"
                  required
                  placeholder="Escolha"
                  opcoes={lista(opcoes.modalidades)}
                  disabled={somenteLeitura}
                />
              )}
            </form.AppField>
            <form.AppField name="especialidadeId">
              {(f) => (
                <f.SelectField
                  label="Especialidade"
                  required
                  placeholder="Escolha"
                  opcoes={lista(opcoes.especialidades)}
                  disabled={somenteLeitura}
                />
              )}
            </form.AppField>
            <form.AppField name="categoriaId">
              {(f) => (
                <f.SelectField
                  label="Categoria"
                  required
                  placeholder="Escolha"
                  opcoes={lista(opcoes.categorias)}
                  disabled={somenteLeitura}
                />
              )}
            </form.AppField>
            <form.AppField name="prioridadeId">
              {(f) => (
                <f.SelectField
                  label="Prioridade"
                  required
                  placeholder="Escolha"
                  opcoes={lista(opcoes.prioridades)}
                  disabled={somenteLeitura}
                />
              )}
            </form.AppField>
            <form.AppField name="faixaInicio">
              {(f) => (
                <f.TextField
                  label="Faixa: de"
                  placeholder="Sem faixa"
                  spellCheck={false}
                  description="Volume do mês; vazio vale para qualquer volume."
                />
              )}
            </form.AppField>
            <form.AppField name="faixaFim">
              {(f) => (
                <f.TextField label="Faixa: até" placeholder="Sem limite" spellCheck={false} />
              )}
            </form.AppField>
            {temFaixa && (
              <form.AppField name="condVolume">
                {(f) => (
                  <f.SelectField
                    label="Volume somado por"
                    required
                    placeholder="Escolha"
                    opcoes={Object.entries(ROTULO_COND).map(([valor, rotulo]) => ({
                      valor,
                      rotulo,
                    }))}
                    description="Os exames do mês do cliente que contam para a faixa (faturem ou não)."
                    className="sm:col-span-2"
                  />
                )}
              </form.AppField>
            )}
            <form.AppField name="valor">
              {(f) => (
                <f.TextField
                  label="Valor (R$)"
                  required
                  placeholder="0,00"
                  spellCheck={false}
                  description="Vírgula nos centavos, como 1.200,50."
                />
              )}
            </form.AppField>
            <form.AppField name="aPartirDe">
              {(f) => (
                <f.SelectField
                  label="Vale a partir de"
                  required
                  placeholder="Escolha a competência"
                  opcoes={competencias}
                  description="Só competências abertas ou futuras."
                />
              )}
            </form.AppField>
          </div>
          {erro && <Alerta tom="erro">{erro}</Alerta>}
          <RequiredLegend />
          <div className="flex flex-wrap justify-end gap-2">
            {item && (
              <ConfirmarAcao
                acao="Encerrar preço"
                titulo={`Encerrar a partir de ${mesAno(aPartirDe)}?`}
                consequencia={
                  apagaDeVez
                    ? 'Este preço é programado e nunca valeu: ele sai da tabela, e o preço que ele substituiria volta a valer. O histórico fica na auditoria.'
                    : `O preço deixa de valer a partir de ${mesAno(aPartirDe)}; as competências anteriores continuam com ele. Sem outro preço, o arranjo passa para a tabela seguinte.`
                }
                onConfirmar={() =>
                  tentar(async () => {
                    await precosControllerEncerrar({
                      path: { tipo, donoId, precoId: item.id },
                      body: { aPartirDe },
                    }).unwrap();
                    await recarregar();
                    avisos.sucesso(apagaDeVez ? 'Preço programado removido.' : 'Preço encerrado.');
                    onVoltar();
                  })
                }
              />
            )}
            <form.AppForm>
              <form.SubmitButton>{item ? 'Salvar alteração' : 'Incluir preço'}</form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      )}

      {item && (
        <HistoricoArranjo tipo={tipo} donoId={donoId} item={item} mesAtual={tabela.mesAtual} />
      )}
    </div>
  );
}

/** Todas as versões do arranjo (todas as faixas), da mais nova para a mais antiga. */
function HistoricoArranjo({
  tipo,
  donoId,
  item,
  mesAtual,
}: {
  tipo: 'cliente' | 'contratado';
  donoId: string;
  item: ItemPrecoDto;
  mesAtual: string;
}) {
  const id = useId();
  const historico = useQuery(
    precosControllerHistoricoQueryOptions({
      path: { tipo, donoId },
      query: {
        modalidadeId: item.modalidadeId,
        especialidadeId: item.especialidadeId,
        categoriaId: item.categoriaId,
        prioridadeId: item.prioridadeId,
      },
    }),
  );
  const paginacao = usePaginaLocal(historico.data ?? [], 5);
  let conteudo: ReactNode;
  if (historico.isError)
    conteudo = (
      <AbaComErro onTentarDeNovo={() => void historico.refetch()}>
        Não foi possível carregar o histórico agora.
      </AbaComErro>
    );
  else if (!historico.data) conteudo = <CamposCarregando quantidade={2} />;
  else
    conteudo = (
      <>
        <ul className="flex flex-col divide-y rounded-md border">
          {paginacao.itensDaPagina.map((v) => {
            const emVigor =
              (v.vigenciaDesde === null || v.vigenciaDesde <= mesAtual) &&
              (v.vigenciaAte === null || v.vigenciaAte >= mesAtual);
            return (
              <li key={v.id} className="flex flex-col gap-1 px-3 py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">{moeda(v.valor)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {textoDaFaixa(v.faixaInicio, v.faixaFim)}
                  </span>
                  {emVigor && <Etiqueta tom="sucesso">Em vigor</Etiqueta>}
                  {v.vigenciaDesde !== null && v.vigenciaDesde > mesAtual && (
                    <Etiqueta tom="info">Programado</Etiqueta>
                  )}
                </span>
                <span className="tabular-nums">
                  {textoDaVigencia(v.vigenciaDesde, v.vigenciaAte)}
                </span>
                <span className="text-muted-foreground text-[13px] tabular-nums">
                  {v.criadoEm
                    ? `Criado em ${dataDeBrasilia(v.criadoEm)}${v.criadoPor ? ` por ${v.criadoPor}` : ''}`
                    : 'Veio da carga do dashboards-one'}
                  {v.encerradoEm &&
                    `; encerrado em ${dataDeBrasilia(v.encerradoEm)}${v.encerradoPor ? ` por ${v.encerradoPor}` : ''}`}
                </span>
              </li>
            );
          })}
        </ul>
        {paginacao.precisaPaginar && (
          <Paginacao
            pagina={paginacao.pagina}
            porPagina={paginacao.porPagina}
            total={paginacao.total}
            onIrPara={paginacao.irPara}
          />
        )}
      </>
    );
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h5
        id={id}
        className="text-subtle-foreground flex items-center gap-1 text-[13px] font-medium"
      >
        Histórico de vigências
        <AjudaContextual assunto="o histórico">
          Toda mudança encerra a versão anterior e cria outra; nada se apaga, salvo o preço
          programado que nunca valeu.
        </AjudaContextual>
      </h5>
      {conteudo}
    </section>
  );
}

/** Importar a planilha (CSV com `;`, no modelo da exportação), a partir de uma competência. */
function ImportarPlanilha({
  tipo,
  donoId,
  tabela,
  onFechar,
  onImportado,
}: {
  tipo: 'cliente' | 'contratado';
  donoId: string;
  tabela: TabelaPrecosDto;
  onFechar: () => void;
  onImportado: (texto: string) => void;
}) {
  const queryClient = useQueryClient();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [aPartirDe, setAPartirDe] = useState(tabela.aPartirDeSugerido);
  const [erro, setErro] = useState<string>();
  const [linhas, setLinhas] = useState<{ linha: number; erro: string }[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [faltaArquivo, setFaltaArquivo] = useState(false);
  const idArquivo = useId();
  const idCompetencia = useId();

  const importar = async () => {
    if (!arquivo) {
      setFaltaArquivo(true);
      return;
    }
    setEnviando(true);
    setErro(undefined);
    setLinhas([]);
    try {
      const conteudo = await arquivo.text();
      const r = await precosControllerImportar({
        path: { tipo, donoId },
        body: { conteudo, aPartirDe },
      }).unwrap();
      await queryClient.invalidateQueries({ queryKey: chaveDoDono(tipo, donoId) });
      onImportado(
        `Planilha importada: ${plural(r.incluidos, { um: 'preço incluído', varios: 'preços incluídos' })}, ${plural(r.alterados, { um: 'alterado', varios: 'alterados' })} e ${plural(r.iguais, { um: 'igual', varios: 'iguais' })}.`,
      );
    } catch (e) {
      setErro(mensagemDaApi(e, 'Não foi possível importar agora. Tente de novo.'));
      if (ResponseError.is(e)) {
        const { erros } = (e.data ?? {}) as { erros?: { linha: number; erro: string }[] };
        if (Array.isArray(erros)) setLinhas(erros);
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      titulo="Importar planilha de preços"
      descricao="Inclui os arranjos novos e altera os que mudaram. O que a planilha não traz fica como está."
      onFechar={onFechar}
      onEnviar={() => void importar()}
      alterado={Boolean(arquivo)}
      acao={
        <Button type="submit" disabled={enviando} className={buttonClassName({})}>
          {enviando ? 'Importando…' : 'Importar planilha'}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={idArquivo} className="font-medium">
          Planilha (CSV com ;)
          <span aria-hidden className="text-destructive">
            {' '}
            *
          </span>
        </label>
        <input
          id={idArquivo}
          type="file"
          required
          accept=".csv,text/csv"
          aria-invalid={faltaArquivo || undefined}
          onChange={(e) => {
            setArquivo(e.target.files?.[0] ?? null);
            setFaltaArquivo(false);
          }}
          className="file:border-input file:bg-card text-[14px] file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5"
        />
        <p className="text-muted-foreground text-[13px]">
          No modelo da exportação, com "Vale a partir de" em cada linha: a linha exportada traz o
          início do preço (MM/AAAA ou "desde sempre") e muda só ele; a linha com a coluna vazia é
          preço novo ou alterado a partir da competência abaixo. Se a tabela mudou depois da
          exportação, a linha é recusada: exporte de novo.
        </p>
        {faltaArquivo && <p className="text-destructive text-[13px]">Escolha a planilha.</p>}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={idCompetencia} className="font-medium">
          Vale a partir de
          <span aria-hidden className="text-destructive">
            {' '}
            *
          </span>
        </label>
        <Select
          id={idCompetencia}
          required
          value={aPartirDe}
          onValueChange={setAPartirDe}
          opcoes={opcoesAPartirDe(tabela.aPartirDeMinimo, tabela.mesAtual).map((c) => ({
            valor: c,
            rotulo: mesAno(c),
          }))}
        />
      </div>
      {erro && (
        <Alerta tom="erro">
          <p>{erro}</p>
          {linhas.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {linhas.slice(0, 10).map((l) => (
                <li key={`${l.linha}-${l.erro}`}>
                  Linha {l.linha}: {l.erro}
                </li>
              ))}
              {linhas.length > 10 && <li>e mais {linhas.length - 10}.</li>}
            </ul>
          )}
        </Alerta>
      )}
      <p className="text-muted-foreground text-[13px]">* Campo obrigatório</p>
    </Dialogo>
  );
}
