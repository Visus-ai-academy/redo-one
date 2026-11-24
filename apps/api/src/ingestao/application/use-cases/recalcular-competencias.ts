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
    const [iniciais, tabela] = await Promise.all([
      this.competencias.listar(),
      this.cortes.carregar(),
    ]);
    let bloqueadas = iniciais;
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
      // Relidas a cada lote: a competência fechada durante a execução não muda mais a partir daqui.
      bloqueadas = await this.competencias.listar();
      const bloqueada = new Set(bloqueadas);
      const mudancas = lote.flatMap((l) => {
        if (bloqueada.has(l.competencia)) return [];
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
        // A linha da competência antes dos laudos: se o job cair depois de gravar o lote, a
        // retentativa não vê mais a mudança, e a competência ficaria sem linha (sem como fechar).
        await this.competencias.garantir([...new Set(mudancas.map((m) => m.competencia))].sort());
        await this.laudos.atualizarCompetencias(mudancas, this.agora());
        alterados += mudancas.length;
      }
      if (lote.length < LOTE) break;
      depoisDe = lote[lote.length - 1]?.id ?? null;
    }

    return { lidos, alterados };
  }
}
