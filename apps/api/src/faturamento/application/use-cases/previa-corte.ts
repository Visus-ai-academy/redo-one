import { cadeiaDoCliente, competenciaPelaCadeia } from '../../../ingestao/domain/competencia';
import { comNovaVigencia } from '../../domain/vigencia-corte';
import type { CompetenciasRepository } from '../ports/competencias.repository';
import type { CortesRepository } from '../ports/cortes.repository';
import type { LaudosCompetencia } from '../ports/laudos-competencia';
import { type PedidoVigencia, prepararVigencia } from './preparar-vigencia';

const LOTE = 5000;

export interface MovimentoPrevia {
  de: string;
  para: string;
  laudos: number;
}

export interface Previa {
  alterados: number;
  movimentos: MovimentoPrevia[];
}

/**
 * Quantos laudos mudariam de competência com a nova vigência, sem gravar nada. Faz a mesma conta
 * do job de recálculo: só laudos com competência a partir de `desde` (antes dele nada muda), fora
 * das competências bloqueadas, e nunca para uma bloqueada.
 */
export class PreviaCorte {
  constructor(
    private readonly cortes: CortesRepository,
    private readonly competencias: CompetenciasRepository,
    private readonly laudos: LaudosCompetencia,
  ) {}

  async executar(pedido: PedidoVigencia): Promise<Previa> {
    const vigencia = await prepararVigencia(pedido, this.cortes, this.competencias);
    const [tabela, bloqueadas] = await Promise.all([
      this.cortes.carregar(),
      this.competencias.listar(),
    ]);
    const nova = comNovaVigencia(tabela, vigencia);
    const bloqueada = new Set(bloqueadas);
    const contagem = new Map<string, MovimentoPrevia>();
    let depoisDe: string | null = null;

    for (;;) {
      const lote = await this.laudos.lerParaPrevia({
        clienteId: vigencia.clienteId,
        aPartirDe: vigencia.desde,
        competenciasBloqueadas: bloqueadas,
        depoisDe,
        limite: LOTE,
      });
      for (const l of lote) {
        const para = competenciaPelaCadeia(
          l.dataRealizacao,
          l.dataLaudo,
          cadeiaDoCliente(nova, l.clienteId),
        );
        if (para === l.competencia || bloqueada.has(para)) continue;
        const chave = `${l.competencia}>${para}`;
        const movimento = contagem.get(chave) ?? { de: l.competencia, para, laudos: 0 };
        movimento.laudos += 1;
        contagem.set(chave, movimento);
      }
      if (lote.length < LOTE) break;
      depoisDe = lote[lote.length - 1]?.id ?? null;
    }

    const movimentos = [...contagem.values()].sort(
      (a, b) => a.de.localeCompare(b.de) || a.para.localeCompare(b.para),
    );
    return { alterados: movimentos.reduce((s, m) => s + m.laudos, 0), movimentos };
  }
}
