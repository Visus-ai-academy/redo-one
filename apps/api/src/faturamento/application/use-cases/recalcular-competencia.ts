import type { Auditoria } from '../../../auditoria/auditoria';
import {
  CompetenciaNaoFechadaError,
  type ContextoRecalculo,
  ContextoSemRecalculoError,
  exigirMotivo,
} from '../../domain/recalculo-competencia';
import type { CompetenciasRepository } from '../ports/competencias.repository';
import type { RecalculoComAutor, RecalculosCompetencia } from '../ports/recalculos-competencia';
import type { RegistroRecalculadores } from '../recalculadores';
import { ENTIDADE_COMPETENCIA, situacaoDa } from './situacao';

/**
 * Refaz o cálculo de um contexto (faturamento, repasse) numa competência fechada, sem reabri-la:
 * exige o motivo, grava quem pediu e quando, e enfileira o job do contexto, que grava o resultado
 * como versão nova (a anterior fica guardada). O job automático continua ignorando a fechada; só
 * este pedido explícito, com permissão e motivo, mexe nela.
 */
export class RecalcularCompetenciaFechada {
  constructor(
    private readonly competencias: CompetenciasRepository,
    private readonly recalculos: RecalculosCompetencia,
    private readonly registro: RegistroRecalculadores,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(
    usuarioId: string,
    competencia: string,
    contexto: ContextoRecalculo,
    motivo: string,
  ): Promise<string> {
    const limpo = exigirMotivo(motivo);
    const { status } = await situacaoDa(this.competencias, competencia);
    if (status !== 'fechada') throw new CompetenciaNaoFechadaError();
    const recalculador = this.registro.obter(contexto);
    if (!recalculador) throw new ContextoSemRecalculoError(contexto);

    const em = this.agora();
    const id = await this.recalculos.solicitar(
      { competencia, contexto, motivo: limpo, solicitadoPorId: usuarioId, solicitadoEm: em },
      recalculador,
    );
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: ENTIDADE_COMPETENCIA,
      entidadeId: competencia,
      acao: 'recalculo_solicitado',
      depois: { recalculoId: id, contexto, motivo: limpo },
      em,
    });
    return id;
  }
}

/** Histórico dos recálculos da competência (todos os contextos), o mais novo primeiro. */
export class ListarRecalculos {
  constructor(
    private readonly competencias: CompetenciasRepository,
    private readonly recalculos: RecalculosCompetencia,
  ) {}

  async executar(competencia: string): Promise<RecalculoComAutor[]> {
    await situacaoDa(this.competencias, competencia);
    return this.recalculos.listar(competencia);
  }
}
