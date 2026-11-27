import { Button } from '@base-ui/react/button';
import { X } from '@phosphor-icons/react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import type { TituloItemDto } from '../../../gen/types/TituloItemDto';
import { formatarDia, invalidarFinanceiro, rotuloDaCategoria } from '../../../lib/financeiro';
import { moeda } from '../../../lib/formato';
import { pode } from '../../../lib/permissoes';
import {
  diaDeHoje,
  etiquetaDaSituacao,
  numeroDoTitulo,
  ROTULO_ORIGEM,
  type TipoTitulo,
} from '../../../lib/titulos';
import { buttonClassName } from '../../button/button-class';
import { ListaCadastro } from '../../cadastro/ListaCadastro';
import { CampoData } from '../../campo-data/CampoData';
import { createDataTableColumnHelper } from '../../data-table/columns';
import { LinkDaLinha } from '../../data-table/link-da-linha';
import { Etiqueta } from '../../etiqueta/Etiqueta';
import {
  type CadastroComHistorico,
  HistoricoCadastro,
} from '../../historico-cadastro/HistoricoCadastro';
import { PainelCarregando } from '../../painel/PainelCarregando';
import { Select } from '../../select/Select';
import { useFaseDoCarregamento } from '../../skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../toast/use-avisos';
import { apiDeRecorrencias, apiDoTipo, opcoesDeApoio, TEXTOS_DO_TIPO } from './api';
import { type BuscaTitulos, consultaDeTitulos, POR_PAGINA_TITULOS, ROTA_DO_TIPO } from './busca';
import { DialogoBaixa } from './DialogoBaixa';
import { PainelLancarTitulo } from './PainelLancarTitulo';
import { PainelTitulo } from './PainelTitulo';

const TODAS = 'todas';
type Acesso = Parameters<typeof pode>[0];

type ListaTitulosProps = {
  tipo: TipoTitulo;
  busca: BuscaTitulos;
  ir: (mudar: (atual: BuscaTitulos) => BuscaTitulos, replace?: boolean) => void;
  acesso: Acesso;
  abas?: ReactNode;
};

const coluna = createDataTableColumnHelper<TituloItemDto>();

/** Aba Títulos de Contas a pagar e de Contas a receber: filtros, lista com os totais e o painel. */
export function ListaTitulos({ tipo, busca, ir, acesso, abas }: ListaTitulosProps) {
  const textos = TEXTOS_DO_TIPO[tipo];
  const api = apiDoTipo(tipo);
  const tela = api.tela;
  const hoje = diaDeHoje();
  const podeBaixar = pode(acesso, `${tela}.baixar`);
  const podeCriar = pode(acesso, `${tela}.criar`);
  const lista = useQuery({
    ...api.listar(consultaDeTitulos(busca, hoje)),
    placeholderData: keepPreviousData,
  });
  const apoio = opcoesDeApoio(tipo);
  const empresas = useQuery(apoio.empresas);
  const categorias = useQuery(apoio.categorias);
  const contas = useQuery(apoio.contas);
  const [paraBaixa, setParaBaixa] = useState<TituloItemDto | null>(null);
  const queryClient = useQueryClient();
  const { sucesso } = useAvisos();
  const pagina = lista.data ?? {
    itens: [],
    pagina: 1,
    porPagina: POR_PAGINA_TITULOS,
    total: 0,
    totais: { abertoCentavos: 0, vencidoCentavos: 0 },
  };

  const filtrar = useCallback(
    (novos: Partial<BuscaTitulos>) =>
      ir((atual) => ({ ...atual, ...novos, pagina: undefined }), true),
    [ir],
  );

  const colunas = useMemo(
    () => [
      coluna.accessor('numero', {
        header: 'Nº',
        cell: (info) => (
          <LinkDaLinha
            to="."
            search={
              ((a: BuscaTitulos) => ({ ...a, id: info.row.original.id, novo: undefined })) as never
            }
          >
            <span className="whitespace-nowrap">{numeroDoTitulo(tipo, info.getValue())}</span>
          </LinkDaLinha>
        ),
      }),
      coluna.accessor((t) => t.favorecido.nome, {
        id: 'favorecido',
        header: textos.favorecido,
        cell: (info) => (
          <span className="flex max-w-72 min-w-0 flex-col">
            <span className="truncate font-medium" title={info.getValue()}>
              {info.getValue()}
            </span>
            <span
              className="text-muted-foreground truncate text-[13px]"
              title={info.row.original.descricao}
            >
              {info.row.original.descricao}
            </span>
          </span>
        ),
      }),
      coluna.accessor('empresaNome', {
        header: 'Empresa',
        cell: (info) => (
          <span className="text-muted-foreground whitespace-nowrap">{info.getValue()}</span>
        ),
      }),
      tipo === 'receber'
        ? coluna.accessor('origem', {
            header: 'Origem',
            cell: (info) => (
              <span className="text-muted-foreground">
                {ROTULO_ORIGEM[info.getValue()] ?? info.getValue()}
              </span>
            ),
          })
        : coluna.accessor('categoriaNome', {
            header: 'Categoria',
            cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
          }),
      coluna.accessor('vencimento', {
        header: 'Vencimento',
        cell: (info) => (
          <span className="whitespace-nowrap tabular-nums">{formatarDia(info.getValue())}</span>
        ),
      }),
      coluna.accessor('valorCentavos', {
        header: () => <span className="block text-right">Valor</span>,
        cell: (info) => (
          <span className="block text-right whitespace-nowrap tabular-nums">
            {moeda(info.getValue() / 100)}
          </span>
        ),
      }),
      coluna.accessor((t) => t.valorCentavos - t.pagoCentavos, {
        id: 'saldo',
        header: () => <span className="block text-right">Saldo</span>,
        cell: (info) => (
          <span className="block text-right whitespace-nowrap tabular-nums">
            {info.row.original.situacao === 'cancelado' ? '—' : moeda(info.getValue() / 100)}
          </span>
        ),
      }),
      coluna.accessor('situacao', {
        header: 'Situação',
        cell: (info) => {
          const e = etiquetaDaSituacao(info.row.original, hoje);
          return <Etiqueta tom={e.tom}>{e.texto}</Etiqueta>;
        },
      }),
      coluna.display({
        id: 'acao',
        header: () => <span className="sr-only">Ações</span>,
        cell: (info) => {
          const t = info.row.original;
          if (!podeBaixar || (t.situacao !== 'aberto' && t.situacao !== 'parcial')) return null;
          return (
            <span className="flex justify-end">
              <Button
                type="button"
                onClick={() => setParaBaixa(t)}
                aria-label={`Dar baixa no ${numeroDoTitulo(tipo, t.numero)}`}
                className={buttonClassName({
                  variant: 'secondary',
                  className: 'h-8 whitespace-nowrap',
                })}
              >
                Dar baixa
              </Button>
            </span>
          );
        },
      }),
    ],
    [tipo, textos.favorecido, hoje, podeBaixar],
  );

  const opcoesEmpresa = [
    { valor: TODAS, rotulo: 'Todas as empresas' },
    ...(empresas.data ?? []).map((e) => ({ valor: e.id, rotulo: e.nome })),
  ];
  const opcoesCategoria = [
    { valor: TODAS, rotulo: 'Todas as categorias' },
    ...(categorias.data ?? []).map((c) => ({ valor: c.id, rotulo: rotuloDaCategoria(c) })),
  ];
  const temFiltro = [
    busca.empresa,
    busca.situacao,
    busca.vence,
    busca.categoria,
    busca.origem,
    busca.favorecidoId,
  ].some((v) => v !== undefined);

  return (
    <>
      <ListaCadastro
        titulo={textos.titulo}
        totalNoTitulo={false}
        abas={abas}
        novo={
          podeCriar
            ? {
                rotulo: textos.lancar,
                onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })),
              }
            : undefined
        }
        busca={{
          valor: busca.busca,
          rotulo: `Buscar em ${textos.titulo}`,
          placeholder: textos.buscar,
        }}
        temFiltro={temFiltro}
        filtros={
          <>
            {busca.favorecidoId && (
              <span className="bg-accent flex h-9 items-center gap-2 rounded-md px-3">
                <span className="max-w-48 truncate">
                  {busca.favorecidoNome ?? textos.favorecido}
                </span>
                <Button
                  type="button"
                  aria-label="Tirar o filtro do favorecido"
                  onClick={() =>
                    filtrar({
                      favorecidoTipo: undefined,
                      favorecidoId: undefined,
                      favorecidoNome: undefined,
                    })
                  }
                  className="hover:text-foreground text-muted-foreground"
                >
                  <X size={14} aria-hidden />
                </Button>
              </span>
            )}
            <Select
              aria-label="Filtrar por empresa"
              value={busca.empresa ?? TODAS}
              onValueChange={(v) => filtrar({ empresa: v === TODAS ? undefined : v })}
              opcoes={opcoesEmpresa}
              className="flex-[1_1_180px] md:flex-[0_1_220px]"
            />
            <Select
              aria-label="Filtrar por situação"
              value={busca.situacao ?? 'em_aberto'}
              onValueChange={(v) =>
                filtrar({
                  situacao: v === 'em_aberto' ? undefined : (v as BuscaTitulos['situacao']),
                })
              }
              opcoes={[
                { valor: 'em_aberto', rotulo: 'Em aberto' },
                { valor: 'vencidos', rotulo: 'Vencidos' },
                { valor: 'parcial', rotulo: 'Parciais' },
                { valor: 'liquidado', rotulo: 'Liquidados' },
                { valor: 'cancelado', rotulo: 'Cancelados' },
                { valor: TODAS, rotulo: 'Todas as situações' },
              ]}
              className="flex-[1_1_160px] md:flex-[0_1_180px]"
            />
            <Select
              aria-label="Filtrar por vencimento"
              value={busca.vence ?? TODAS}
              onValueChange={(v) =>
                filtrar({
                  vence: v === TODAS ? undefined : (v as BuscaTitulos['vence']),
                  de: undefined,
                  ate: undefined,
                })
              }
              opcoes={[
                { valor: TODAS, rotulo: 'Qualquer vencimento' },
                { valor: 'hoje', rotulo: 'Vence até hoje' },
                { valor: '7dias', rotulo: 'Vence em até 7 dias' },
                { valor: 'periodo', rotulo: 'Vencimento no período…' },
              ]}
              className="flex-[1_1_180px] md:flex-[0_1_210px]"
            />
            {busca.vence === 'periodo' && (
              <span className="flex flex-[1_1_300px] items-center gap-2 md:flex-[0_1_320px]">
                <CampoData
                  aria-label="Vencimento de"
                  value={busca.de ?? ''}
                  onValueChange={(v) => filtrar({ de: v || undefined })}
                  className="min-w-0 flex-1"
                />
                <span className="text-muted-foreground">a</span>
                <CampoData
                  aria-label="Vencimento até"
                  value={busca.ate ?? ''}
                  min={busca.de}
                  onValueChange={(v) => filtrar({ ate: v || undefined })}
                  className="min-w-0 flex-1"
                />
              </span>
            )}
            {tipo === 'receber' ? (
              <Select
                aria-label="Filtrar por origem"
                value={busca.origem ?? TODAS}
                onValueChange={(v) =>
                  filtrar({ origem: v === TODAS ? undefined : (v as BuscaTitulos['origem']) })
                }
                opcoes={[
                  { valor: TODAS, rotulo: 'Todas as origens' },
                  { valor: 'manual', rotulo: ROTULO_ORIGEM.manual ?? 'Lançado à mão' },
                  { valor: 'faturamento', rotulo: ROTULO_ORIGEM.faturamento ?? 'Faturamento' },
                ]}
                className="flex-[1_1_160px] md:flex-[0_1_180px]"
              />
            ) : (
              <Select
                aria-label="Filtrar por categoria"
                value={busca.categoria ?? TODAS}
                onValueChange={(v) => filtrar({ categoria: v === TODAS ? undefined : v })}
                opcoes={opcoesCategoria}
                className="flex-[1_1_180px] md:flex-[0_1_240px]"
              />
            )}
          </>
        }
        colunas={colunas}
        itens={pagina.itens}
        getRowId={(t) => t.id}
        selecionadoId={busca.id}
        recarregando={lista.isPlaceholderData}
        erro={
          lista.isError && !lista.data
            ? { erro: lista.error, oQue: 'os títulos', onTentarDeNovo: () => void lista.refetch() }
            : undefined
        }
        pagina={pagina.pagina}
        porPagina={pagina.porPagina}
        total={pagina.total}
        resumo={
          <>
            {'Em aberto '}
            <strong className="text-foreground">{moeda(pagina.totais.abertoCentavos / 100)}</strong>
            {' · vencido '}
            <strong
              className={pagina.totais.vencidoCentavos ? 'text-destructive' : 'text-foreground'}
            >
              {moeda(pagina.totais.vencidoCentavos / 100)}
            </strong>
          </>
        }
        vazio={{
          titulo: textos.vazio,
          texto: podeCriar ? textos.textoVazio : 'Quem administra o financeiro lança os títulos.',
        }}
        onFiltrar={filtrar}
        onLimparFiltros={() =>
          filtrar({
            busca: undefined,
            empresa: undefined,
            situacao: undefined,
            vence: undefined,
            de: undefined,
            ate: undefined,
            categoria: undefined,
            origem: undefined,
            favorecidoTipo: undefined,
            favorecidoId: undefined,
            favorecidoNome: undefined,
          })
        }
        onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
        painel={
          busca.id || (busca.novo && podeCriar) ? (
            <PainelDoTitulo
              key={busca.id ?? 'novo'}
              tipo={tipo}
              id={busca.id}
              ir={ir}
              acesso={acesso}
            />
          ) : undefined
        }
      />
      {paraBaixa && (
        <DialogoBaixa
          tipo={tipo}
          titulo={paraBaixa}
          contas={(contas.data?.itens ?? []).filter(
            (c) => c.contratadoId === paraBaixa.contratadoId,
          )}
          onFechar={() => setParaBaixa(null)}
          onBaixar={async (dados) => {
            await api.baixar({ path: { id: paraBaixa.id }, body: dados }).unwrap();
            setParaBaixa(null);
            sucesso('Baixa registrada.');
            await invalidarFinanceiro(queryClient);
          }}
        />
      )}
    </>
  );
}

/** O painel do título aberto (`?id=`) ou o de lançar um novo (`?novo=1`). */
function PainelDoTitulo({
  tipo,
  id,
  ir,
  acesso,
}: {
  tipo: TipoTitulo;
  id?: string;
  ir: ListaTitulosProps['ir'];
  acesso: Acesso;
}) {
  const api = apiDoTipo(tipo);
  const tela = api.tela;
  const queryClient = useQueryClient();
  const { sucesso } = useAvisos();
  const [editando, setEditando] = useState(false);
  const apoio = opcoesDeApoio(tipo);
  const empresas = useQuery(apoio.empresas);
  const categorias = useQuery(apoio.categorias);
  const contas = useQuery(apoio.contas);
  const consulta = useQuery({ ...api.obter({ path: { id: id ?? '' } }), enabled: Boolean(id) });
  const titulo = consulta.data;
  const carregando = (Boolean(id) && !titulo) || !empresas.data || !categorias.data || !contas.data;
  const fase = useFaseDoCarregamento(carregando);
  const fechar = () => ir((a) => ({ ...a, id: undefined, novo: undefined }));
  const recarregar = () => invalidarFinanceiro(queryClient);

  if (carregando || fase !== 'conteudo') {
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consulta.error ?? empresas.error ?? categorias.error ?? contas.error ?? undefined}
        oQue="o título"
        voltar={{
          to: ROTA_DO_TIPO[tipo],
          rotulo: `Voltar para ${TEXTOS_DO_TIPO[tipo].titulo}`,
        }}
        onTentarDeNovo={() => {
          void consulta.refetch();
          void empresas.refetch();
          void categorias.refetch();
          void contas.refetch();
        }}
      />
    );
  }

  const todasAsContas = contas.data?.itens ?? [];
  if (!titulo || editando) {
    return (
      <PainelLancarTitulo
        tipo={tipo}
        titulo={titulo}
        empresas={empresas.data ?? []}
        categorias={categorias.data ?? []}
        contas={todasAsContas}
        buscarFavorecidos={(termo, sinal) =>
          api.favorecidos({ query: { busca: termo || undefined }, signal: sinal }).unwrap()
        }
        onFechar={titulo ? () => setEditando(false) : fechar}
        recorrencia={
          titulo
            ? undefined
            : {
                prever: (agenda, sinal) =>
                  apiDeRecorrencias(tipo).previa({ body: agenda, signal: sinal }).unwrap(),
                onSalvar: async (dados) => {
                  const criada = await apiDeRecorrencias(tipo).criar({ body: dados }).unwrap();
                  await recarregar();
                  sucesso(
                    criada.titulosGerados
                      ? `Recorrência criada. ${criada.titulosGerados} ${criada.titulosGerados === 1 ? 'título gerado' : 'títulos gerados'}.`
                      : 'Recorrência criada.',
                  );
                  ir(() => ({ aba: 'recorrentes', id: criada.id }), true);
                },
              }
        }
        onSalvar={async (dados) => {
          if (titulo) {
            await api.atualizar({ path: { id: titulo.id }, body: dados }).unwrap();
            await recarregar();
            setEditando(false);
            sucesso('Título salvo.');
            return;
          }
          const { id: novo } = await api.criar({ body: dados }).unwrap();
          await recarregar();
          sucesso('Título lançado.');
          ir((a) => ({ ...a, novo: undefined, id: novo }), true);
        }}
      />
    );
  }

  const cadastro: CadastroComHistorico = tipo === 'pagar' ? 'titulo-pagar' : 'titulo-receber';
  return (
    <PainelTitulo
      tipo={tipo}
      titulo={titulo}
      pode={{
        editar: pode(acesso, `${tela}.editar`),
        baixar: pode(acesso, `${tela}.baixar`),
        estornar: pode(acesso, `${tela}.estornar`),
        cancelar: pode(acesso, `${tela}.cancelar`),
      }}
      contas={todasAsContas.filter((c) => c.contratadoId === titulo.contratadoId)}
      historico={<HistoricoCadastro key={titulo.id} cadastro={cadastro} id={titulo.id} />}
      origem={
        titulo.recorrencia ? (
          <span className="flex flex-col">
            <LinkDaLinha
              to="."
              search={(() => ({ aba: 'recorrentes', id: titulo.recorrencia?.id })) as never}
            >
              {`Recorrência: ${titulo.recorrencia.descricao}`}
            </LinkDaLinha>
            {titulo.recorrencia.modoValor === 'previsto' && !titulo.editadoAMao && (
              <span className="text-warning text-[13px]">
                Valor previsto: confira (e edite) antes de dar baixa.
              </span>
            )}
          </span>
        ) : undefined
      }
      onFechar={fechar}
      onEditar={() => setEditando(true)}
      onBaixar={async (dados) => {
        await api.baixar({ path: { id: titulo.id }, body: dados }).unwrap();
        await recarregar();
      }}
      onEstornar={async (baixaId, motivo) => {
        await api.estornar({ path: { id: titulo.id, baixaId }, body: { motivo } }).unwrap();
        await recarregar();
      }}
      onCancelar={async (motivo) => {
        await api.cancelar({ path: { id: titulo.id }, body: { motivo } }).unwrap();
        await recarregar();
      }}
      onProrrogar={async (dados) => {
        await api.prorrogar({ path: { id: titulo.id }, body: dados }).unwrap();
        await recarregar();
      }}
    />
  );
}
