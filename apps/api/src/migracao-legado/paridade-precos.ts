import {
  buscarPreco,
  type LinhaPreco,
  type OrigemPreco,
  type ResultadoPreco,
  volumeDaFaixa,
} from '../faturamento/domain/preco';

/** Laudo do redo-one na paridade de preços, com o arranjo resolvido. */
export interface LaudoParidadePreco {
  id: string;
  /** Chave natural (`laudos.identidade`). */
  identidade: string;
  competencia: string;
  /** Principal (ou o próprio cliente). */
  clienteId: string;
  /** Unidade de origem, quando o laudo é de uma. */
  unidadeId: string | null;
  /** Contratado do cliente: escolhe a tabela padrão. */
  contratadoId: string | null;
  modalidadeId: string | null;
  especialidadeId: string | null;
  categoriaId: string | null;
  prioridadeId: string | null;
  volume: number;
  /** Fatura pela tipificação; só esses entram na comparação (os outros só somam volume). */
  fatura: boolean;
  nomes: { cliente: string; membro: string; arranjo: string };
}

export interface TabelasParidade {
  /** Preços por cliente ou unidade. */
  porCliente: ReadonlyMap<string, LinhaPreco[]>;
  porContratado: ReadonlyMap<string, LinhaPreco[]>;
  alternativas: ReadonlyMap<string, string>;
}

/**
 * Preço de cada laudo pela busca do redo-one: volume da faixa pelo membro (a unidade, ou o cliente
 * quando o laudo não é de unidade), somando todos os laudos dele na competência.
 */
export function precificarLaudos(
  laudos: readonly LaudoParidadePreco[],
  tabelas: TabelasParidade,
  /**
   * Como o dashboards-one: um condVolume só por arranjo, o da primeira linha (pelo id) do arranjo
   * exato na tabela do membro (a da unidade, se ela tem preços, senão a do principal).
   */
  condPorArranjo = false,
): Map<string, ResultadoPreco> {
  const membro = (l: LaudoParidadePreco) => `${l.competencia}|${l.unidadeId ?? l.clienteId}`;
  const porMembro = new Map<string, LaudoParidadePreco[]>();
  for (const l of laudos) porMembro.set(membro(l), [...(porMembro.get(membro(l)) ?? []), l]);
  const volumes = new Map([...porMembro].map(([k, ls]) => [k, volumeDaFaixa(ls)]));

  const r = new Map<string, ResultadoPreco>();
  for (const l of laudos) {
    if (!l.modalidadeId || !l.especialidadeId || !l.categoriaId || !l.prioridadeId) {
      r.set(l.id, { encontrado: false });
      continue;
    }
    const arranjo = {
      modalidadeId: l.modalidadeId,
      especialidadeId: l.especialidadeId,
      categoriaId: l.categoriaId,
      prioridadeId: l.prioridadeId,
    };
    const volume = volumes.get(membro(l)) as ReturnType<typeof volumeDaFaixa>;
    const lista = (origem: OrigemPreco, linhas: LinhaPreco[] | undefined) => ({
      origem,
      linhas: linhas ?? [],
    });
    const doMembro =
      (l.unidadeId && tabelas.porCliente.get(l.unidadeId)?.length
        ? tabelas.porCliente.get(l.unidadeId)
        : tabelas.porCliente.get(l.clienteId)) ?? [];
    const condFixo = condPorArranjo
      ? doMembro
          .filter(
            (p) =>
              p.modalidadeId === arranjo.modalidadeId &&
              p.especialidadeId === arranjo.especialidadeId &&
              p.categoriaId === arranjo.categoriaId &&
              p.prioridadeId === arranjo.prioridadeId,
          )
          .sort((a, b) => a.id.localeCompare(b.id))[0]?.condVolume
      : undefined;
    r.set(
      l.id,
      buscarPreco({
        condFixo,
        arranjo,
        competencia: l.competencia,
        tabelas: [
          ...(l.unidadeId ? [lista('unidade', tabelas.porCliente.get(l.unidadeId))] : []),
          lista('principal', tabelas.porCliente.get(l.clienteId)),
          lista('padrao', l.contratadoId ? tabelas.porContratado.get(l.contratadoId) : undefined),
        ],
        alternativas: tabelas.alternativas,
        volume: (cond) => volume(cond, arranjo),
      }),
    );
  }
  return r;
}

/** O unitário que o dashboards-one cobrou do laudo (do demonstrativo do grupo, pelo arranjo). */
export interface PrecoLegado {
  grupo: string;
  /** Nulo: o demonstrativo do grupo não tem o arranjo do laudo do redo-one. */
  unitario: number | null;
  /** Por que não há unitário, quando não é o arranjo que falta (ex.: grupo sem demonstrativo). */
  semValor?: string;
}

export interface GrupoDivergenciaPreco {
  cliente: string;
  arranjo: string;
  legado: number | null;
  redo: number | null;
  motivo: string;
  laudos: number;
}

export interface ResultadoParidadePreco {
  /** Laudos do redo-one que faturam. */
  total: number;
  iguais: number;
  divergentes: number;
  /** Sem o mesmo laudo (chave natural) no dashboards-one. */
  semPar: number;
  grupos: GrupoDivergenciaPreco[];
}

const ORIGEM: Record<OrigemPreco, string> = {
  unidade: 'tabela da unidade',
  principal: 'tabela do cliente',
  padrao: 'tabela padrão',
};
const SEM_ARRANJO = 'arranjo do redo-one não está no demonstrativo do dashboards-one';

/**
 * Compara o unitário de cada laudo que fatura no redo-one com o do mesmo laudo (chave natural) no
 * dashboards-one. Sem preço nos dois (lá R$ 0, "preço não cadastrado") conta como igual.
 */
export function compararPrecos(
  laudos: readonly LaudoParidadePreco[],
  precos: ReadonlyMap<string, ResultadoPreco>,
  legado: ReadonlyMap<string, PrecoLegado>,
): ResultadoParidadePreco {
  const r: ResultadoParidadePreco = { total: 0, iguais: 0, divergentes: 0, semPar: 0, grupos: [] };
  const grupos = new Map<string, GrupoDivergenciaPreco>();
  for (const l of laudos) {
    if (!l.fatura) continue;
    r.total += 1;
    const a = legado.get(l.identidade);
    if (!a) {
      r.semPar += 1;
      continue;
    }
    const p = precos.get(l.id) ?? { encontrado: false };
    const redo = p.encontrado ? p.valor : null;
    const antigo = a.unitario === 0 ? null : a.unitario;
    if (a.unitario !== null && (redo ?? 0) === (antigo ?? 0)) {
      r.iguais += 1;
      continue;
    }
    if (
      a.unitario !== null &&
      redo !== null &&
      antigo !== null &&
      Math.abs(redo - antigo) < 0.005
    ) {
      r.iguais += 1;
      continue;
    }
    r.divergentes += 1;
    const motivo =
      a.unitario === null
        ? (a.semValor ?? SEM_ARRANJO)
        : p.encontrado
          ? `redo-one: ${ORIGEM[p.origem]} (${p.como})`
          : 'redo-one: sem preço';
    const g: GrupoDivergenciaPreco = {
      cliente: l.nomes.membro,
      arranjo: l.nomes.arranjo,
      legado: antigo,
      redo,
      motivo,
      laudos: 0,
    };
    const k = JSON.stringify([g.cliente, g.arranjo, g.legado, g.redo, g.motivo]);
    const atual = grupos.get(k) ?? g;
    atual.laudos += 1;
    grupos.set(k, atual);
  }
  r.grupos = [...grupos.values()].sort((x, y) => y.laudos - x.laudos);
  return r;
}
