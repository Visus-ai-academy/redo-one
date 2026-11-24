import type { Auditoria } from '../../../auditoria/auditoria';
import {
  CompetenciaEmAndamentoError,
  CompetenciaJaFechadaError,
  fechar,
} from '../../domain/competencia-status';
import { mesAcabou } from '../../domain/vigencia-corte';
import type { CompetenciasRepository } from '../ports/competencias.repository';
import { ENTIDADE_COMPETENCIA, situacaoDa } from './situacao';

/**
 * Fecha a competência aberta cujo mês já acabou em Brasília. Fechada, ela passa a ser ignorada
 * pela importação e pelo recálculo na hora (a porta `CompetenciasBloqueadas` a devolve).
 */
export class FecharCompetencia {
  constructor(
    private readonly competencias: CompetenciasRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, competencia: string): Promise<void> {
    const { status } = await situacaoDa(this.competencias, competencia);
    const novo = fechar(status);
    const em = this.agora();
    if (!mesAcabou(competencia, em)) throw new CompetenciaEmAndamentoError();
    if (!(await this.competencias.fechar(competencia, { usuarioId, em }))) {
      throw new CompetenciaJaFechadaError();
    }
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: ENTIDADE_COMPETENCIA,
      entidadeId: competencia,
      acao: 'fechada',
      antes: { status },
      depois: { status: novo },
      em,
    });
  }
}
