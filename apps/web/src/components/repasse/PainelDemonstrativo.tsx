import type { ReactNode } from 'react';

import type { DemonstrativoDetalheDto } from '../../gen/types/DemonstrativoDetalheDto';
import type { GrupoRepasseDto } from '../../gen/types/GrupoRepasseDto';
import { moeda, numero } from '../../lib/formato';
import { nomeCompetencia, origemDoPreco, textoDoArranjo } from '../../lib/repasse';
import { Abas } from '../abas/Abas';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { PainelLateral } from '../painel/PainelLateral';

export type AbaDemonstrativo = 'grupos' | 'dias' | 'adicionais' | 'laudos';

const ABAS: { valor: AbaDemonstrativo; rotulo: string }[] = [
  { valor: 'grupos', rotulo: 'Grupos' },
  { valor: 'dias', rotulo: 'Dias' },
  { valor: 'adicionais', rotulo: 'Adicionais' },
  { valor: 'laudos', rotulo: 'Laudos' },
];

/** Lista curta que a API já manda inteira: paginada no navegador, 5 por página no painel. */
const POR_PAGINA_NO_PAINEL = 5;

type PainelDemonstrativoProps = {
  demonstrativo: DemonstrativoDetalheDto;
  aba: AbaDemonstrativo;
  onAba: (aba: AbaDemonstrativo) => void;
  onFechar: () => void;
  /** Link para definir o preço que falta (a aba Repasse do médico); nulo sem permissão. */
  definirPreco: (medicoId: string) => ReactNode;
  /** Conteúdo da aba Laudos (paginada pela API). */
  laudos: ReactNode;
};

const reais = (centavos: number) => numero(centavos / 100, 2);
const direita = (conteudo: ReactNode) => <span className="block text-right">{conteudo}</span>;
const dia = (iso: string) => iso.split('-').reverse().join('/');

type LinhaGrupo =
  | ({ tipo: 'grupo' } & GrupoRepasseDto)
  | { tipo: 'regra'; id: string; descricao: string; totalCentavos: number };

/**
 * Detalhe do demonstrativo de um médico na versão vista: os valores, os grupos com a origem do
 * preço (e as regras de apuração), a visão por dia, os adicionais e os laudos pagos.
 */
export function PainelDemonstrativo({
  demonstrativo: d,
  aba,
  onAba,
  onFechar,
  definirPreco,
  laudos,
}: PainelDemonstrativoProps) {
  const subtitulo = [
    nomeCompetencia(d.competencia),
    `versão ${d.versao}${d.versaoAtual ? '' : ' (guardada)'}`,
    d.contratado,
  ]
    .filter(Boolean)
    .join(' · ');
  const resumo = [
    { rotulo: 'Volume', valor: numero(d.volume) },
    { rotulo: 'Exames', valor: moeda(d.examesCentavos / 100) },
    { rotulo: 'Adicionais', valor: moeda(d.adicionaisCentavos / 100) },
    { rotulo: 'Bruto', valor: moeda(d.brutoCentavos / 100) },
    { rotulo: 'Retenções', valor: moeda(d.retencoesCentavos / 100) },
    { rotulo: 'Líquido', valor: moeda(d.liquidoCentavos / 100) },
  ];

  return (
    <PainelLateral titulo={d.medico} subtitulo={subtitulo} largura="larga" onFechar={onFechar}>
      <div className="flex flex-col gap-4 p-4">
        <ul
          aria-label="Valores do médico"
          className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border px-4 py-3 tabular-nums"
        >
          {resumo.map((r) => (
            <li key={r.rotulo} className="flex flex-col">
              <span className="text-subtle-foreground text-xs">{r.rotulo}</span>
              <span className="font-semibold">{r.valor}</span>
            </li>
          ))}
        </ul>
        <Abas
          abas={ABAS}
          valor={aba}
          onMudar={(v) => onAba(v as AbaDemonstrativo)}
          aria-label="Detalhe do repasse"
        >
          {aba === 'grupos' && <Grupos d={d} definirPreco={definirPreco} />}
          {aba === 'dias' && <Dias d={d} />}
          {aba === 'adicionais' && <Lancamentos d={d} />}
          {aba === 'laudos' && laudos}
        </Abas>
      </div>
    </PainelLateral>
  );
}

const colunaGrupo = createDataTableColumnHelper<LinhaGrupo>();

function Grupos({
  d,
  definirPreco,
}: {
  d: DemonstrativoDetalheDto;
  definirPreco: PainelDemonstrativoProps['definirPreco'];
}) {
  const linhas: LinhaGrupo[] = [
    ...d.grupos.map((g) => ({ ...g, tipo: 'grupo' as const })),
    ...d.lancamentos
      .filter((l) => l.tipo === 'regra')
      .map((l) => ({
        tipo: 'regra' as const,
        id: l.id,
        descricao: l.descricao,
        totalCentavos: l.totalCentavos,
      })),
  ];
  const pagina = usePaginaLocal(linhas, POR_PAGINA_NO_PAINEL);
  const linkDefinir = definirPreco(d.medicoId);
  const colunas = [
    colunaGrupo.display({
      id: 'arranjo',
      header: 'Arranjo',
      cell: ({ row: { original: l } }) =>
        l.tipo === 'regra' ? (
          l.descricao
        ) : (
          <span className="flex flex-col leading-snug">
            <span>{textoDoArranjo(l)}</span>
            {l.unidade && (
              <span className="text-subtle-foreground text-xs">Unidade {l.unidade}</span>
            )}
          </span>
        ),
    }),
    colunaGrupo.display({
      id: 'cliente',
      header: 'Cliente',
      cell: ({ row: { original: l } }) => (
        <span className="[overflow-wrap:anywhere]">
          {l.tipo === 'grupo' ? (l.cliente ?? '—') : '—'}
        </span>
      ),
    }),
    colunaGrupo.display({
      id: 'volume',
      header: () => direita('Vol.'),
      cell: ({ row: { original: l } }) => direita(l.tipo === 'grupo' ? numero(l.volume) : '—'),
    }),
    colunaGrupo.display({
      id: 'unitario',
      header: () => direita('Unitário'),
      cell: ({ row: { original: l } }) =>
        direita(
          l.tipo === 'grupo' && l.origem !== 'sem_preco' && l.unitarioCentavos !== null
            ? reais(l.unitarioCentavos)
            : '—',
        ),
    }),
    colunaGrupo.display({
      id: 'total',
      header: () => direita('Total'),
      cell: ({ row: { original: l } }) => direita(reais(l.totalCentavos)),
    }),
    colunaGrupo.display({
      id: 'origem',
      header: 'Preço veio de',
      cell: ({ row: { original: l } }) =>
        l.tipo === 'regra' ? (
          <span className="text-muted-foreground">Regra de apuração</span>
        ) : l.origem === 'sem_preco' ? (
          <span className="text-warning font-medium whitespace-nowrap">
            Sem preço
            {linkDefinir && <> · {linkDefinir}</>}
          </span>
        ) : (
          <span className="text-muted-foreground">{origemDoPreco(l)}</span>
        ),
    }),
  ];
  if (!linhas.length)
    return <p className="text-muted-foreground">Nenhum laudo pago nesta versão; só adicionais.</p>;
  return (
    <div className="flex flex-col rounded-lg border">
      <DataTable
        columns={colunas}
        data={pagina.itensDaPagina}
        getRowId={(l) => l.id}
        linhaEmDestaque={(l) => l.tipo === 'grupo' && l.origem === 'sem_preco'}
      />
      {pagina.precisaPaginar && (
        <Paginacao
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
          onIrPara={pagina.irPara}
        />
      )}
    </div>
  );
}

const colunaDia = createDataTableColumnHelper<DemonstrativoDetalheDto['dias'][number]>();
const COLUNAS_DIA = [
  colunaDia.accessor('dia', { header: 'Dia', cell: (info) => dia(info.getValue()) }),
  colunaDia.accessor('volume', {
    header: () => direita('Volume'),
    cell: (info) => direita(numero(info.getValue())),
  }),
  colunaDia.accessor('totalCentavos', {
    header: () => direita('Exames'),
    cell: (info) => direita(reais(info.getValue())),
  }),
];

function Dias({ d }: { d: DemonstrativoDetalheDto }) {
  const pagina = usePaginaLocal(d.dias, POR_PAGINA_NO_PAINEL);
  if (!d.dias.length)
    return <p className="text-muted-foreground">Nenhum laudo pago nesta versão.</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-[13px]">
        Dia do laudo, no horário de Brasília. Os dias somam o valor dos exames.
      </p>
      <div className="flex flex-col rounded-lg border">
        <DataTable columns={COLUNAS_DIA} data={pagina.itensDaPagina} getRowId={(x) => x.dia} />
        {pagina.precisaPaginar && (
          <Paginacao
            pagina={pagina.pagina}
            porPagina={pagina.porPagina}
            total={pagina.total}
            onIrPara={pagina.irPara}
          />
        )}
      </div>
    </div>
  );
}

const ROTULO_LANCAMENTO = { adicional: 'Adicional', regra: 'Regra', retencao: 'Retenção' } as const;
const colunaLancamento =
  createDataTableColumnHelper<DemonstrativoDetalheDto['lancamentos'][number]>();
const COLUNAS_LANCAMENTO = [
  colunaLancamento.accessor('tipo', {
    header: 'Tipo',
    cell: (info) => ROTULO_LANCAMENTO[info.getValue()],
  }),
  colunaLancamento.accessor('descricao', { header: 'Descrição' }),
  colunaLancamento.accessor('totalCentavos', {
    header: () => direita('Valor'),
    cell: (info) => direita(reais(info.getValue())),
  }),
];

function Lancamentos({ d }: { d: DemonstrativoDetalheDto }) {
  const lancamentos = d.lancamentos.filter((l) => l.tipo !== 'regra');
  const pagina = usePaginaLocal(lancamentos, POR_PAGINA_NO_PAINEL);
  if (!lancamentos.length)
    return (
      <p className="text-muted-foreground">
        Nenhum adicional nesta versão. Os lançamentos ficam na aba Adicionais da tela.
      </p>
    );
  return (
    <div className="flex flex-col rounded-lg border">
      <DataTable columns={COLUNAS_LANCAMENTO} data={pagina.itensDaPagina} getRowId={(l) => l.id} />
      {pagina.precisaPaginar && (
        <Paginacao
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
          onIrPara={pagina.irPara}
        />
      )}
    </div>
  );
}
