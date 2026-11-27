import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import type { RecorrenciaDto } from '../../../gen/types/RecorrenciaDto';
import type { RecorrenciaItemDto } from '../../../gen/types/RecorrenciaItemDto';
import type { TituloAjustavelDto } from '../../../gen/types/TituloAjustavelDto';
import { formatarDia, invalidarFinanceiro } from '../../../lib/financeiro';
import { moeda } from '../../../lib/formato';
import { pode } from '../../../lib/permissoes';
import {
  frequenciaPorExtenso,
  ROTULO_FREQUENCIA,
  type TipoTitulo,
  terminoPorExtenso,
} from '../../../lib/titulos';
import { ListaCadastro } from '../../cadastro/ListaCadastro';
import { createDataTableColumnHelper } from '../../data-table/columns';
import { LinkDaLinha } from '../../data-table/link-da-linha';
import { Etiqueta } from '../../etiqueta/Etiqueta';
import { HistoricoCadastro } from '../../historico-cadastro/HistoricoCadastro';
import { PainelCarregando } from '../../painel/PainelCarregando';
import { Select } from '../../select/Select';
import { useFaseDoCarregamento } from '../../skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../toast/use-avisos';
import { apiDeRecorrencias, apiDoTipo, opcoesDeApoio, TEXTOS_DO_TIPO } from './api';
import {
  type BuscaTitulos,
  consultaDeRecorrencias,
  POR_PAGINA_RECORRENCIAS,
  ROTA_DO_TIPO,
  SITUACAO_RECORRENCIA,
} from './busca';
import { DialogoValeParaOsGerados } from './DialogoValeParaOsGerados';
import { PainelLancarTitulo } from './PainelLancarTitulo';
import { PainelRecorrencia } from './PainelRecorrencia';

const TODAS = 'todas';
type Acesso = Parameters<typeof pode>[0];
type Ir = (mudar: (atual: BuscaTitulos) => BuscaTitulos, replace?: boolean) => void;

const coluna = createDataTableColumnHelper<RecorrenciaItemDto>();

/** Aba Recorrentes: as contas que geram títulos de tempos em tempos. */
export function ListaRecorrencias({
  tipo,
  busca,
  ir,
  acesso,
  abas,
}: {
  tipo: TipoTitulo;
  busca: BuscaTitulos;
  ir: Ir;
  acesso: Acesso;
  abas: ReactNode;
}) {
  const textos = TEXTOS_DO_TIPO[tipo];
  const api = apiDeRecorrencias(tipo);
  const tela = apiDoTipo(tipo).tela;
  const podeCriar = pode(acesso, `${tela}.criar`);
  const lista = useQuery({
    ...api.listar(consultaDeRecorrencias(busca)),
    placeholderData: keepPreviousData,
  });
  const empresas = useQuery(opcoesDeApoio(tipo).empresas);
  const pagina = lista.data ?? {
    itens: [],
    pagina: 1,
    porPagina: POR_PAGINA_RECORRENCIAS,
    total: 0,
    previstoMensalCentavos: 0,
  };
  const filtrar = useCallback(
    (novos: Partial<BuscaTitulos>) =>
      ir((atual) => ({ ...atual, ...novos, pagina: undefined }), true),
    [ir],
  );

  const colunas = useMemo(
    () => [
      coluna.accessor('descricao', {
        header: 'Descrição',
        cell: (info) => (
          <LinkDaLinha
            to="."
            search={
              ((a: BuscaTitulos) => ({ ...a, id: info.row.original.id, novo: undefined })) as never
            }
          >
            <span className="block max-w-64 truncate" title={info.getValue()}>
              {info.getValue()}
            </span>
          </LinkDaLinha>
        ),
      }),
      coluna.accessor((r) => r.favorecido.nome, {
        id: 'favorecido',
        header: textos.favorecido,
        cell: (info) => (
          <span className="block max-w-56 truncate" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
      }),
      coluna.accessor('empresaNome', {
        header: 'Empresa',
        cell: (info) => (
          <span className="text-muted-foreground whitespace-nowrap">{info.getValue()}</span>
        ),
      }),
      coluna.accessor('frequencia', {
        header: 'Frequência',
        cell: (info) => (
          <span className="whitespace-nowrap">
            {frequenciaPorExtenso(info.getValue(), info.row.original.diaVencimento ?? null)}
          </span>
        ),
      }),
      coluna.accessor('valorCentavos', {
        header: () => <span className="block text-right">Valor</span>,
        cell: (info) => (
          <span className="block text-right whitespace-nowrap tabular-nums">
            {moeda(info.getValue() / 100)}
            {info.row.original.modoValor === 'previsto' && (
              <span className="text-muted-foreground"> previsto</span>
            )}
          </span>
        ),
      }),
      coluna.accessor('proximoVencimento', {
        header: 'Próximo vencimento',
        cell: (info) => (
          <span className="whitespace-nowrap tabular-nums">
            {info.row.original.situacao === 'ativa' && info.getValue()
              ? formatarDia(info.getValue() as string)
              : '—'}
          </span>
        ),
      }),
      coluna.accessor('termino', {
        header: 'Término',
        cell: (info) => {
          const r = info.row.original;
          return (
            <span className="text-muted-foreground whitespace-nowrap">
              {r.situacao === 'encerrada' && r.encerradaEm
                ? `Encerrada em ${new Date(r.encerradaEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
                : terminoPorExtenso({
                    termino: r.termino,
                    terminoEm: r.terminoEm ?? null,
                    terminoOcorrencias: r.terminoOcorrencias ?? null,
                  })}
            </span>
          );
        },
      }),
      coluna.accessor('situacao', {
        header: 'Situação',
        cell: (info) => {
          const s = SITUACAO_RECORRENCIA[info.getValue()];
          return s ? <Etiqueta tom={s.tom}>{s.texto}</Etiqueta> : null;
        },
      }),
    ],
    [textos.favorecido],
  );

  return (
    <ListaCadastro
      titulo={textos.titulo}
      totalNoTitulo={false}
      abas={abas}
      novo={
        podeCriar
          ? {
              rotulo: 'Nova recorrência',
              onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })),
            }
          : undefined
      }
      busca={{
        valor: busca.busca,
        rotulo: 'Buscar recorrências',
        placeholder: `Descrição ou ${textos.favorecido.toLowerCase()}`,
      }}
      temFiltro={[busca.empresa, busca.situacaoRecorrencia, busca.frequencia].some(Boolean)}
      filtros={
        <>
          <Select
            aria-label="Filtrar por empresa"
            value={busca.empresa ?? TODAS}
            onValueChange={(v) => filtrar({ empresa: v === TODAS ? undefined : v })}
            opcoes={[
              { valor: TODAS, rotulo: 'Todas as empresas' },
              ...(empresas.data ?? []).map((e) => ({ valor: e.id, rotulo: e.nome })),
            ]}
            className="flex-[1_1_180px] md:flex-[0_1_220px]"
          />
          <Select
            aria-label="Filtrar por situação"
            value={busca.situacaoRecorrencia ?? TODAS}
            onValueChange={(v) =>
              filtrar({
                situacaoRecorrencia:
                  v === TODAS ? undefined : (v as BuscaTitulos['situacaoRecorrencia']),
              })
            }
            opcoes={[
              { valor: TODAS, rotulo: 'Todas as situações' },
              { valor: 'ativa', rotulo: 'Ativas' },
              { valor: 'pausada', rotulo: 'Pausadas' },
              { valor: 'encerrada', rotulo: 'Encerradas' },
            ]}
            className="flex-[1_1_160px] md:flex-[0_1_180px]"
          />
          <Select
            aria-label="Filtrar por frequência"
            value={busca.frequencia ?? TODAS}
            onValueChange={(v) =>
              filtrar({ frequencia: v === TODAS ? undefined : (v as BuscaTitulos['frequencia']) })
            }
            opcoes={[
              { valor: TODAS, rotulo: 'Todas as frequências' },
              ...Object.entries(ROTULO_FREQUENCIA).map(([valor, rotulo]) => ({ valor, rotulo })),
            ]}
            className="flex-[1_1_160px] md:flex-[0_1_200px]"
          />
        </>
      }
      colunas={colunas}
      itens={pagina.itens}
      getRowId={(r) => r.id}
      selecionadoId={busca.id}
      recarregando={lista.isPlaceholderData}
      erro={
        lista.isError && !lista.data
          ? {
              erro: lista.error,
              oQue: 'as recorrências',
              onTentarDeNovo: () => void lista.refetch(),
            }
          : undefined
      }
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      resumo={
        <>
          {'Previsto por mês (ativas) '}
          <strong className="text-foreground">{moeda(pagina.previstoMensalCentavos / 100)}</strong>
        </>
      }
      vazio={{
        titulo: 'Nenhuma conta recorrente.',
        texto: podeCriar
          ? 'Crie as contas que se repetem (aluguel, contador, mensalidade): os títulos saem sozinhos.'
          : 'Quem administra o financeiro cria as contas recorrentes.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() =>
        filtrar({
          busca: undefined,
          empresa: undefined,
          situacaoRecorrencia: undefined,
          frequencia: undefined,
        })
      }
      onIrPara={(n) => ir((a) => ({ ...a, pagina: n }))}
      painel={
        busca.id || (busca.novo && podeCriar) ? (
          <PainelDaRecorrencia
            key={busca.id ?? 'nova'}
            tipo={tipo}
            id={busca.id}
            ir={ir}
            acesso={acesso}
          />
        ) : undefined
      }
    />
  );
}

/** A recorrência aberta (`?id=`), a edição dela ou a criação (`?novo=1`). */
function PainelDaRecorrencia({
  tipo,
  id,
  ir,
  acesso,
}: {
  tipo: TipoTitulo;
  id?: string;
  ir: Ir;
  acesso: Acesso;
}) {
  const api = apiDeRecorrencias(tipo);
  const tela = apiDoTipo(tipo).tela;
  const queryClient = useQueryClient();
  const { sucesso } = useAvisos();
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState<{
    dados: RecorrenciaDto;
    ajustaveis: TituloAjustavelDto[];
  } | null>(null);
  const apoio = opcoesDeApoio(tipo);
  const empresas = useQuery(apoio.empresas);
  const categorias = useQuery(apoio.categorias);
  const contas = useQuery(apoio.contas);
  const consulta = useQuery({ ...api.obter({ path: { id: id ?? '' } }), enabled: Boolean(id) });
  const r = consulta.data;
  const carregando = (Boolean(id) && !r) || !empresas.data || !categorias.data || !contas.data;
  const fase = useFaseDoCarregamento(carregando);
  const fechar = () => ir((a) => ({ ...a, id: undefined, novo: undefined }));
  const recarregar = () => invalidarFinanceiro(queryClient);

  if (carregando || fase !== 'conteudo') {
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consulta.error ?? empresas.error ?? categorias.error ?? contas.error ?? undefined}
        oQue="a recorrência"
        voltar={{ to: ROTA_DO_TIPO[tipo], rotulo: `Voltar para ${TEXTOS_DO_TIPO[tipo].titulo}` }}
        onTentarDeNovo={() => {
          void consulta.refetch();
          void empresas.refetch();
          void categorias.refetch();
          void contas.refetch();
        }}
      />
    );
  }

  const salvarEdicao = async (dados: RecorrenciaDto, aplicarAosGerados: boolean) => {
    if (!r) return;
    const { titulosAtualizados } = await api
      .atualizar({ path: { id: r.id }, body: { ...dados, aplicarAosGerados } })
      .unwrap();
    await recarregar();
    setConfirmar(null);
    setEditando(false);
    sucesso(
      titulosAtualizados
        ? `Recorrência salva. ${titulosAtualizados} ${titulosAtualizados === 1 ? 'título atualizado' : 'títulos atualizados'}.`
        : 'Recorrência salva.',
    );
  };

  if (!r || editando) {
    return (
      <>
        <PainelLancarTitulo
          tipo={tipo}
          empresas={empresas.data ?? []}
          categorias={categorias.data ?? []}
          contas={contas.data?.itens ?? []}
          buscarFavorecidos={(termo, sinal) =>
            apiDoTipo(tipo)
              .favorecidos({ query: { busca: termo || undefined }, signal: sinal })
              .unwrap()
          }
          onSalvar={async () => undefined}
          onFechar={r ? () => setEditando(false) : fechar}
          recorrencia={{
            ligada: true,
            editando: r,
            prever: (agenda, sinal) => api.previa({ body: agenda, signal: sinal }).unwrap(),
            onSalvar: async (dados) => {
              if (r) {
                const ajustaveis = await api.ajustaveis({ path: { id: r.id } }).unwrap();
                if (ajustaveis.length > 0) {
                  setConfirmar({ dados, ajustaveis });
                  return;
                }
                await salvarEdicao(dados, false);
                return;
              }
              const criada = await api.criar({ body: dados }).unwrap();
              await recarregar();
              sucesso(
                criada.titulosGerados
                  ? `Recorrência criada. ${criada.titulosGerados} ${criada.titulosGerados === 1 ? 'título gerado' : 'títulos gerados'}.`
                  : 'Recorrência criada.',
              );
              ir((a) => ({ ...a, novo: undefined, id: criada.id }), true);
            },
          }}
        />
        {confirmar && (
          <DialogoValeParaOsGerados
            tipo={tipo}
            ajustaveis={confirmar.ajustaveis}
            onFechar={() => setConfirmar(null)}
            onConfirmar={(aplicar) => salvarEdicao(confirmar.dados, aplicar)}
          />
        )}
      </>
    );
  }

  return (
    <PainelRecorrencia
      tipo={tipo}
      recorrencia={r}
      pode={{
        editar: pode(acesso, `${tela}.editar`),
        criar: pode(acesso, `${tela}.criar`),
        cancelar: pode(acesso, `${tela}.cancelar`),
      }}
      historico={
        <HistoricoCadastro
          key={r.id}
          cadastro={tipo === 'pagar' ? 'recorrencia-pagar' : 'recorrencia-receber'}
          id={r.id}
        />
      }
      onFechar={fechar}
      onEditar={() => setEditando(true)}
      onPausar={async () => {
        await api.pausar({ path: { id: r.id } }).unwrap();
        await recarregar();
      }}
      onRetomar={async () => {
        await api.retomar({ path: { id: r.id } }).unwrap();
        await recarregar();
      }}
      onGerarProximo={async () => {
        await api.gerarProximo({ path: { id: r.id } }).unwrap();
        await recarregar();
      }}
      onEncerrar={async (motivo) => {
        await api.encerrar({ path: { id: r.id }, body: { motivo } }).unwrap();
        await recarregar();
      }}
    />
  );
}
