import { cadeiaDoCliente, competenciaPelaCadeia } from '../../domain/competencia';
import type { CompetenciasBloqueadas } from '../ports/competencias-bloqueadas';
import type { LeitorCortesCompetencia } from '../ports/cortes-competencia';
import type { LaudosRepository } from '../ports/laudos.repository';

/** Laudos por lote: lidos e gravados de cada vez. */
const LOTE = 5000;

export interface PedidoRecalculo {
  /** Nulo = todos os laudos (mudança do corte padrão). */
  clienteIds: string[] | null;
}

/**
 * Recalcula a competência gravada nos laudos quando o corte muda: pela cadeia de vigências do
 * cliente, como a importação. Bloqueadas e cortes são lidos na hora de rodar; laudos de competência
 * bloqueada não mudam, nem vão para uma. Idempotente: a competência é função pura das datas, do
 * cliente e dos cortes.
 */
export class RecalcularCompetencias {
  constructor(
    private readonly laudos: LaudosRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly cortes: LeitorCortesCompetencia,
    private readonly agora: () => Date,
  ) {}

  async executar({ clienteIds }: PedidoRecalculo): Promise<{ lidos: number; alterados: number }> {
    const [bloqueadas, tabela] = await Promise.all([
      this.competencias.listar(),
      this.cortes.carregar(),
    ]);
    const bloqueada = new Set(bloqueadas);
    const novas = new Set<string>();
    let lidos = 0;
    let alterados = 0;
    let depoisDe: string | null = null;

    for (;;) {
      const lote = await this.laudos.lerParaRecalculo({
        clienteIds,
        competenciasBloqueadas: bloqueadas,
        depoisDe,
        limite: LOTE,
      });
      lidos += lote.length;
      const mudancas = lote.flatMap((l) => {
        const competencia = competenciaPelaCadeia(
          l.dataRealizacao,
          l.dataLaudo,
          cadeiaDoCliente(tabela, l.clienteId),
        );
        return competencia === l.competencia || bloqueada.has(competencia)
          ? []
          : [{ id: l.id, competencia }];
      });
      if (mudancas.length) {
        await this.laudos.atualizarCompetencias(mudancas, this.agora());
        for (const m of mudancas) novas.add(m.competencia);
        alterados += mudancas.length;
      }
      if (lote.length < LOTE) break;
      depoisDe = lote[lote.length - 1]?.id ?? null;
    }

    if (novas.size) await this.competencias.garantir([...novas].sort());
    return { lidos, alterados };
  }
}
