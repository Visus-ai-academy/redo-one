import { Button } from '@base-ui/react/button';
import { ArrowLeft, DownloadSimple, Plus, UploadSimple } from '@phosphor-icons/react';
import { useStore } from '@tanstack/react-form';
import { keepPreviousData, type QueryKey, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { z } from 'zod';

import { ResponseError } from '../../gen/.kubb/client';
import { precosControllerAlterar } from '../../gen/clients/precosControllerAlterar';
import { precosControllerEncerrar } from '../../gen/clients/precosControllerEncerrar';
import { precosControllerExportar } from '../../gen/clients/precosControllerExportar';
import { precosControllerHistorico } from '../../gen/clients/precosControllerHistorico';
import { precosControllerImportar } from '../../gen/clients/precosControllerImportar';
import { precosControllerIncluir } from '../../gen/clients/precosControllerIncluir';
import { precosControllerListar } from '../../gen/clients/precosControllerListar';
import { precosControllerOpcoes } from '../../gen/clients/precosControllerOpcoes';
import { precosControllerHistoricoQueryKey } from '../../gen/hooks/usePrecosControllerHistorico';
import { precosControllerListarQueryKey } from '../../gen/hooks/usePrecosControllerListar';
import { precosControllerOpcoesQueryKey } from '../../gen/hooks/usePrecosControllerOpcoes';
import type { CondVolumeKey } from '../../gen/types/CondVolume';
import type { SeloAvisoDto } from '../../gen/types/SeloAvisoDto';
import { useSelosDeAviso } from '../../lib/avisos';
import { dataDeBrasilia } from '../../lib/datas';
import { moeda, plural } from '../../lib/formato';
import { AjudaContextual } from '../ajuda/AjudaContextual';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { SeloAviso } from '../avisos/SeloAviso';
import { CampoBusca } from '../busca/CampoBusca';
import { BotaoComCarregamento } from '../button/BotaoComCarregamento';
import { buttonClassName } from '../button/button-class';
import { useErroDoPainel } from '../catalogo/use-erro-do-painel';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { Dialogo } from '../dialogo/Dialogo';
import { AbaComErro } from '../distribuicao/estados';
import { SeletorDeArquivo } from '../envio-arquivo/EnvioDeArquivo';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { MarcaObrigatorio } from '../form/field-parts';
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
  centavosDosReais,
  corpoDoPreco,
  numeroPtBr,
  opcoesAPartirDe,
  ROTULO_COND,
  TODOS_OS_CLIENTES,
  textoDaFaixa,
  textoDaVigencia,
  type ValoresPreco,
} from './precos';

type Opcao = { id: string; nome: string };

/**
 * Uma linha da tabela, de qualquer fonte: o arranjo, a faixa (preço do cliente) ou o cliente
 * (preço de repasse do médico), o valor e a vigência.
 */
export type ItemPrecoTela = {
  id: string;
  modalidadeId: string;
  especialidadeId: string;
  categoriaId: string;
  prioridadeId: string;
  faixaInicio?: number | null;
  faixaFim?: number | null;
  condVolume?: CondVolumeKey;
  /** Só no preço por cliente: nulo com `todosClientes`. */
  clienteId?: string | null;
  todosClientes?: boolean;
  valor: number;
  vigenciaDesde: string | null;
  vigenciaAte: string | null;
  nomes: {
    modalidade: string;
    especialidade: string;
    categoria: string;
    prioridade: string;
    cliente?: string | null;
  };
  duplicado: boolean;
  emVigor: boolean;
};

export type VersaoHistoricoTela = Omit<ItemPrecoTela, 'duplicado' | 'emVigor'> & {
  criadoPor: string | null;
  criadoEm: string | null;
  encerradoPor: string | null;
  encerradoEm: string | null;
};

export type TabelaPrecosTela = {
  mesAtual: string;
  aPartirDeMinimo: string;
  aPartirDeSugerido: string;
  itens: ItemPrecoTela[];
  total: number;
  /** Só na unidade: o nome do cliente principal, de onde vem o preço que faltar. */
  principal?: string | null;
};

export type OpcoesPrecosTela = {
  modalidades: Opcao[];
  especialidades: Opcao[];
  categorias: Opcao[];
  prioridades: Opcao[];
  clientes?: Opcao[];
};

/** O que o formulário manda: os valores, com o cliente ('todos' ou o id) no preço por cliente. */
export type ValoresPrecoTela = ValoresPreco & { clienteId: string };

type Consulta<T> = { queryKey: QueryKey; queryFn: (c: { signal: AbortSignal }) => Promise<T> };

/**
 * De onde vêm e para onde vão os preços: a tabela do cliente ou do contratado (faturamento) ou a
 * do médico (repasse). A tela é a mesma; muda a segunda dimensão (faixa ou cliente) e a API.
 */
export type FontePrecos = {
  /** Prefixo das consultas da tabela (recarregar depois de mudar). */
  chave: QueryKey;
  dimensao: 'faixa' | 'cliente';
  /** Entidade dos selos de aviso (preço repetido). */
  entidadeAviso: string;
  listar: (q: { pagina: number; porPagina: number; busca?: string }) => Consulta<TabelaPrecosTela>;
  opcoes: () => Consulta<OpcoesPrecosTela>;
  historico: (item: ItemPrecoTela) => Consulta<VersaoHistoricoTela[]>;
  incluir: (v: ValoresPrecoTela) => Promise<unknown>;
  alterar: (id: string, v: ValoresPrecoTela) => Promise<unknown>;
  encerrar: (id: string, aPartirDe: string) => Promise<unknown>;
  exportar: () => Promise<{ nomeArquivo: string; conteudo: string }>;
  importar: (
    conteudo: string,
    aPartirDe: string,
  ) => Promise<{ incluidos: number; alterados: number; iguais: number }>;
  /** Texto da lista vazia (com ou sem busca). */
  vazio: (comBusca: boolean, tabela: TabelaPrecosTela) => string;
  /** Aviso acima da tabela (ex.: na unidade, de onde vem o que falta). */
  aviso?: (tabela: TabelaPrecosTela) => ReactNode;
  /** Explica a planilha no importar (as colunas mudam com a dimensão). */
  ajudaPlanilha: string;
};

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
  /** `avisos.ver`: a linha com aviso pendente (ex.: preço repetido) mostra o selo. */
  veAvisos?: boolean;
};

/** A tabela do faturamento: preços do cliente (ou unidade) ou padrão do contratado. */
function fonteFaturamento(tipo: 'cliente' | 'contratado', donoId: string): FontePrecos {
  const path = { tipo, donoId };
  return {
    chave: [{ url: '/faturamento/precos/:tipo/:donoId', params: path }],
    dimensao: 'faixa',
    entidadeAviso: tipo === 'cliente' ? 'preco_cliente' : 'preco_padrao_contratado',
    listar: (query) => ({
      queryKey: precosControllerListarQueryKey({ path, query }),
      queryFn: async ({ signal }) => {
        const r = await precosControllerListar({ path, query, signal }).unwrap();
        return { ...r, principal: r.dono.principal?.nome ?? null };
      },
    }),
    opcoes: () => ({
      queryKey: precosControllerOpcoesQueryKey(),
      queryFn: ({ signal }) => precosControllerOpcoes({ signal }).unwrap(),
    }),
    historico: (item) => {
      const query = {
        modalidadeId: item.modalidadeId,
        especialidadeId: item.especialidadeId,
        categoriaId: item.categoriaId,
        prioridadeId: item.prioridadeId,
      };
      return {
        queryKey: precosControllerHistoricoQueryKey({ path, query }),
        queryFn: async ({ signal }) =>
          (await precosControllerHistorico({ path, query, signal }).unwrap()).map((v) => ({
            ...v,
            criadoEm: v.criadoEm === null ? null : String(v.criadoEm),
            encerradoEm: v.encerradoEm === null ? null : String(v.encerradoEm),
          })),
      };
    },
    incluir: (v) => precosControllerIncluir({ path, body: corpoDoPreco(v) }).unwrap(),
    alterar: (precoId, v) =>
      precosControllerAlterar({ path: { ...path, precoId }, body: corpoDoPreco(v) }).unwrap(),
    encerrar: (precoId, aPartirDe) =>
      precosControllerEncerrar({ path: { ...path, precoId }, body: { aPartirDe } }).unwrap(),
    exportar: () => precosControllerExportar({ path }).unwrap(),
    importar: (conteudo, aPartirDe) =>
      precosControllerImportar({ path, body: { conteudo, aPartirDe } }).unwrap(),
    vazio: (comBusca, { principal }) =>
      comBusca
        ? 'Nenhum preço com essa busca.'
        : principal
          ? `Nenhum preço próprio. Os laudos usam a tabela de ${principal}.`
          : tipo === 'cliente'
            ? 'Nenhum preço cadastrado. Os laudos usam a tabela padrão do contratado.'
            : 'Nenhum preço cadastrado nesta tabela padrão.',
    aviso: ({ principal }) =>
      principal ? (
        <Alerta tom="info">
          Estes são os preços desta unidade. O arranjo que faltar aqui é cobrado pela tabela de{' '}
          {principal}, o cliente principal, e depois pela tabela padrão do contratado.
        </Alerta>
      ) : null,
    ajudaPlanilha:
      'No modelo da exportação, com "Vale a partir de" em cada linha: a linha exportada traz o início do preço (MM/AAAA ou "desde sempre") e muda só ele; a linha com a coluna vazia é preço novo ou alterado a partir da competência abaixo. Se a tabela mudou depois da exportação, a linha é recusada: exporte de novo.',
  };
}

/**
 * Tabela de preços por arranjo, a mesma no cliente (aba Preços) e na tabela padrão do contratado:
 * lista com busca e paginação, e o preço aberto no lugar (formulário com "Vale a partir de" e o
 * histórico de vigências do arranjo). Nada se sobrescreve: alterar e encerrar criam versões.
 */
export function TabelaPrecos({ tipo, donoId, ...resto }: TabelaPrecosProps) {
  const fonte = useMemo(() => fonteFaturamento(tipo, donoId), [tipo, donoId]);
  return <TabelaPrecosDaFonte fonte={fonte} {...resto} />;
}

type Aberto =
  | { modo: 'novo'; arranjo?: Partial<ValoresPrecoTela> }
  | { modo: 'editar'; item: ItemPrecoTela }
  | null;

const coluna = createDataTableColumnHelper<ItemPrecoTela>();
/** As colunas, com o selo dos avisos pendentes de cada versão (`entidade`: a tabela do preço). */
const colunasCom = (
  selos: ReadonlyMap<string, SeloAvisoDto[]>,
  entidade: string,
  dimensao: FontePrecos['dimensao'],
) => [
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
  dimensao === 'faixa'
    ? coluna.accessor((p) => textoDaFaixa(p.faixaInicio ?? null, p.faixaFim ?? null), {
        id: 'faixa',
        header: 'Faixa',
        cell: (c) => <span className="tabular-nums">{c.getValue()}</span>,
      })
    : coluna.accessor((p) => p.nomes.cliente ?? 'Todos os clientes', {
        id: 'cliente',
        header: 'Cliente',
        cell: (c) => <span>{c.getValue()}</span>,
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
        <SeloAviso avisos={selos.get(p.id)} entidade={entidade} />
      </span>
    ),
  }),
];

export type TabelaPrecosDaFonteProps = Omit<TabelaPrecosProps, 'tipo' | 'donoId'> & {
  fonte: FontePrecos;
  /** Abre "Incluir preço" já com o arranjo (atalho do aviso de preço que falta). */
  abrirNovo?: Partial<ValoresPrecoTela>;
  /**
   * Ação a mais na barra (com `podeEditar`), aberta no lugar da tabela como o preço aberto (ex.:
   * "Preencher pela régua do nível" no repasse). `conteudo` recebe como voltar para a tabela.
   */
  acaoExtra?: { rotulo: string; icone: ReactNode; conteudo: (voltar: () => void) => ReactNode };
};

/** A tabela de preços sobre qualquer fonte (faturamento ou repasse). */
export function TabelaPrecosDaFonte({
  fonte,
  podeEditar,
  porPagina = 10,
  onAlterado,
  veAvisos = false,
  abrirNovo,
  acaoExtra,
}: TabelaPrecosDaFonteProps) {
  const [extraAberta, setExtraAberta] = useState(false);
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState<Aberto>(
    abrirNovo && podeEditar ? { modo: 'novo', arranjo: abrirNovo } : null,
  );
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
    ...fonte.listar({ pagina, porPagina, ...(busca ? { busca } : {}) }),
    placeholderData: keepPreviousData,
  });
  const opcoes = useQuery(fonte.opcoes());
  const selos = useSelosDeAviso(
    fonte.entidadeAviso,
    (tabela.data?.itens ?? []).map((p) => p.id),
    veAvisos,
  );
  const colunas = useMemo(
    () => colunasCom(selos, fonte.entidadeAviso, fonte.dimensao),
    [selos, fonte.entidadeAviso, fonte.dimensao],
  );

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

  if (extraAberta && acaoExtra) return acaoExtra.conteudo(() => setExtraAberta(false));

  if (aberto)
    return (
      <EditorPreco
        fonte={fonte}
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
      const r = await fonte.exportar();
      baixarArquivo(r.nomeArquivo, r.conteudo);
    } catch (e) {
      setErroExportar(mensagemDaApi(e, 'Não foi possível exportar agora. Tente de novo.'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {fonte.aviso?.(dados)}
      {erroExportar && <Alerta tom="erro">{erroExportar}</Alerta>}
      <div className="flex flex-wrap items-center gap-2">
        <CampoBusca
          rotulo="Buscar preços"
          placeholder={
            fonte.dimensao === 'cliente'
              ? 'Buscar arranjo ou cliente…'
              : 'Buscar modalidade, especialidade, categoria…'
          }
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
            {acaoExtra && (
              <Button
                type="button"
                onClick={() => setExtraAberta(true)}
                className={buttonClassName({ variant: 'secondary' })}
              >
                {acaoExtra.icone}
                {acaoExtra.rotulo}
              </Button>
            )}
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
        columns={colunas}
        data={dados.itens}
        getRowId={(p) => p.id}
        onRowClick={(item) => setAberto({ modo: 'editar', item })}
        recarregando={tabela.isFetching}
        emptyMessage={fonte.vazio(Boolean(busca), dados)}
        className="max-h-[60vh]"
      />
      {dados.total > 0 && (
        <Paginacao pagina={pagina} porPagina={porPagina} total={dados.total} onIrPara={setPagina} />
      )}
      {importando && (
        <ImportarPlanilha
          fonte={fonte}
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

const esquemaPara = (dimensao: FontePrecos['dimensao']) =>
  z
    .object({
      modalidadeId: z.string().min(1, 'Escolha a modalidade.'),
      especialidadeId: z.string().min(1, 'Escolha a especialidade.'),
      categoriaId: z.string().min(1, 'Escolha a categoria.'),
      prioridadeId: z.string().min(1, 'Escolha a prioridade.'),
      faixaInicio: z.string(),
      faixaFim: z.string(),
      condVolume: z.enum(['MOD', 'MOD_ESP', 'MOD_ESP_CAT', 'TOTAL']),
      clienteId: z.string(),
      valor: z
        .number()
        .int()
        .nullable()
        .refine((c) => c !== null, 'Informe o valor.')
        .refine((c) => c === null || c > 0, 'O valor tem de ser maior que zero.'),
      aPartirDe: z.string().min(1, 'Escolha a competência a partir da qual o preço vale.'),
    })
    .superRefine((v, ctx) => {
      if (dimensao === 'cliente') {
        if (!v.clienteId)
          ctx.addIssue({
            code: 'custom',
            path: ['clienteId'],
            message: 'Escolha o cliente ou "Todos os clientes".',
          });
        return;
      }
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

/** Valores do formulário: os ids, a faixa ou o cliente e o valor em centavos. */
function valoresIniciais(
  item: ItemPrecoTela | undefined,
  aPartirDe: string,
  arranjo?: Partial<ValoresPrecoTela>,
): ValoresPrecoTela {
  return {
    modalidadeId: item?.modalidadeId ?? arranjo?.modalidadeId ?? '',
    especialidadeId: item?.especialidadeId ?? arranjo?.especialidadeId ?? '',
    categoriaId: item?.categoriaId ?? arranjo?.categoriaId ?? '',
    prioridadeId: item?.prioridadeId ?? arranjo?.prioridadeId ?? '',
    faixaInicio: item?.faixaInicio == null ? '' : String(item.faixaInicio),
    faixaFim: item?.faixaFim == null ? '' : String(item.faixaFim),
    condVolume: item?.condVolume ?? 'MOD_ESP_CAT',
    clienteId: item
      ? item.todosClientes
        ? TODOS_OS_CLIENTES
        : (item.clienteId ?? '')
      : (arranjo?.clienteId ?? ''),
    valor: item ? centavosDosReais(item.valor) : null,
    aPartirDe,
  };
}

/** O preço aberto: formulário (novo ou alteração) e o histórico de vigências do arranjo. */
function EditorPreco({
  fonte,
  aberto,
  tabela,
  opcoes,
  podeEditar,
  onAlterado,
  onVoltar,
}: {
  fonte: FontePrecos;
  aberto: NonNullable<Aberto>;
  tabela: TabelaPrecosTela;
  opcoes: OpcoesPrecosTela;
  podeEditar: boolean;
  onAlterado?: (alterado: boolean) => void;
  onVoltar: () => void;
}) {
  const item = aberto.modo === 'editar' ? aberto.item : undefined;
  const arranjo = aberto.modo === 'novo' ? aberto.arranjo : undefined;
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { erro, tentar } = useErroDoPainel();
  const idTitulo = useId();
  const iniciais = useMemo(
    () => valoresIniciais(item, tabela.aPartirDeSugerido, arranjo),
    [item, tabela.aPartirDeSugerido, arranjo],
  );
  const esquema = useMemo(() => esquemaPara(fonte.dimensao), [fonte.dimensao]);
  // Mexer na versão pode resolver o aviso dela (preço repetido): o selo também recarrega.
  const recarregar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: fonte.chave }),
      queryClient.invalidateQueries({ queryKey: [{ url: '/ingestao/avisos/selos' }] }),
    ]);
  const form = useAppForm({
    defaultValues: iniciais,
    validators: { onSubmit: esquema },
    onSubmit: ({ value }) =>
      tentar(async () => {
        const v = value as ValoresPrecoTela;
        if (item) await fonte.alterar(item.id, v);
        else await fonte.incluir(v);
        await recarregar();
        avisos.sucesso(
          item
            ? `Preço alterado a partir de ${mesAno(v.aPartirDe)}.`
            : `Preço incluído a partir de ${mesAno(v.aPartirDe)}.`,
        );
        onVoltar();
      }),
  });
  const alterado = useAlterado(form, iniciais);
  useInformarAlterado(alterado);
  useEffect(() => onAlterado?.(alterado), [alterado, onAlterado]);
  const aPartirDe = useStore(form.store, (s) => s.values.aPartirDe);
  const temFaixa = useStore(form.store, (s) => Boolean(s.values.faixaInicio || s.values.faixaFim));

  const lista = (l: Opcao[]) => l.map((o) => ({ valor: o.id, rotulo: o.nome }));
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
  const segunda =
    item &&
    (fonte.dimensao === 'cliente'
      ? (item.nomes.cliente ?? 'Todos os clientes')
      : textoDaFaixa(item.faixaInicio ?? null, item.faixaFim ?? null).toLowerCase());
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
            {moeda(item.valor)}, {segunda},{' '}
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
            {fonte.dimensao === 'cliente' ? (
              <form.AppField name="clienteId">
                {(f) => (
                  <f.SelectField
                    label="Cliente"
                    required
                    placeholder="Escolha"
                    opcoes={[
                      { valor: TODOS_OS_CLIENTES, rotulo: 'Todos os clientes' },
                      ...lista(opcoes.clientes ?? []),
                    ]}
                    description="O preço de um cliente vale no lugar do de todos os clientes."
                    className="sm:col-span-2"
                  />
                )}
              </form.AppField>
            ) : (
              <>
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
              </>
            )}
            <form.AppField name="valor">
              {(f) => <f.MoedaField label="Valor" required />}
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
                    await fonte.encerrar(item.id, aPartirDe);
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

      {item && <HistoricoArranjo fonte={fonte} item={item} mesAtual={tabela.mesAtual} />}
    </div>
  );
}

/** Todas as versões do arranjo (todas as faixas, ou do cliente), da mais nova para a mais antiga. */
function HistoricoArranjo({
  fonte,
  item,
  mesAtual,
}: {
  fonte: FontePrecos;
  item: ItemPrecoTela;
  mesAtual: string;
}) {
  const id = useId();
  const historico = useQuery(fonte.historico(item));
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
                  {fonte.dimensao === 'faixa' && (
                    <span className="text-muted-foreground tabular-nums">
                      {textoDaFaixa(v.faixaInicio ?? null, v.faixaFim ?? null)}
                    </span>
                  )}
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
  fonte,
  tabela,
  onFechar,
  onImportado,
}: {
  fonte: FontePrecos;
  tabela: TabelaPrecosTela;
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
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
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
      const r = await fonte.importar(conteudo, aPartirDe);
      await queryClient.invalidateQueries({ queryKey: fonte.chave });
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
        <BotaoComCarregamento type="submit" carregando={enviando} rotuloCarregando="Importando…">
          Importar planilha
        </BotaoComCarregamento>
      }
    >
      <div className="flex flex-col gap-2">
        <span className="font-medium">
          Planilha (CSV com ;)
          <MarcaObrigatorio />
        </span>
        <SeletorDeArquivo
          arquivo={arquivo}
          extensao=".csv"
          tamanhoMaximoMb={5}
          rotulo="Planilha (CSV com ;)"
          invalido={faltaArquivo || Boolean(erroArquivo)}
          onEscolher={(escolhido) => {
            setArquivo(escolhido);
            setFaltaArquivo(false);
            setErroArquivo(null);
          }}
          onErro={(mensagem) => {
            setArquivo(null);
            setErroArquivo(mensagem);
          }}
        />
        <p className="text-muted-foreground text-[13px]">{fonte.ajudaPlanilha}</p>
        {faltaArquivo && <p className="text-destructive text-[13px]">Escolha a planilha.</p>}
        {erroArquivo && <p className="text-destructive text-[13px]">{erroArquivo}</p>}
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
