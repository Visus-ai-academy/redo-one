import type { Auditoria } from '../../../auditoria/auditoria';
import { CompetenciaJaAbertaError, reabrir } from '../../domain/competencia-status';
import type { CompetenciasRepository } from '../ports/competencias.repository';
import { ENTIDADE_COMPETENCIA, situacaoDa } from './situacao';

/**
 * Reabre a competência fechada. Não mexe na trava separada da importação nem recalcula: toda
 * vigência de corte começa depois da última fechada, então a cadeia dá o mesmo para os laudos dela.
 */
export class ReabrirCompetencia {
  constructor(
    private readonly competencias: CompetenciasRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, competencia: string): Promise<void> {
    const { status } = await situacaoDa(this.competencias, competencia);
    const novo = reabrir(status);
    const em = this.agora();
    if (!(await this.competencias.reabrir(competencia, { usuarioId, em }))) {
      throw new CompetenciaJaAbertaError();
    }
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: ENTIDADE_COMPETENCIA,
      entidadeId: competencia,
      acao: 'reaberta',
      antes: { status },
      depois: { status: novo },
      em,
    });
  }
}
