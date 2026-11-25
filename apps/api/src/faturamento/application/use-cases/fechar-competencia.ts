import type { Auditoria } from '../../../auditoria/auditoria';
import {
  CompetenciaComAvisosError,
  CompetenciaEmAndamentoError,
  CompetenciaJaFechadaError,
  FecharComAvisosProibidoError,
  fechar,
} from '../../domain/competencia-status';
import { mesAcabou } from '../../domain/vigencia-corte';
import type { AvisosDoFechamento } from '../ports/avisos-do-fechamento';
import type { CompetenciasRepository } from '../ports/competencias.repository';
import { ENTIDADE_COMPETENCIA, situacaoDa } from './situacao';

/** Quantos avisos a recusa lista (o total vai junto; a tela leva à lista filtrada). */
const AVISOS_NA_RECUSA = 20;

export interface OpcoesFechamento {
  /** Permissão `faturamento.competencia.fechar_com_avisos`. */
  podeFecharComAvisos?: boolean;
  /** Obrigatório para fechar com avisos pendentes que impedem. */
  motivoAvisos?: string | null;
}

/**
 * Fecha a competência aberta cujo mês já acabou em Brasília. Fechada, ela passa a ser ignorada
 * pela importação e pelo recálculo na hora (a porta `CompetenciasBloqueadas` a devolve). Aviso
 * pendente de tipo que impede fechar, ligado a ela, recusa o fechamento; quem tem a permissão
 * própria fecha mesmo assim informando o motivo.
 */
export class FecharCompetencia {
  constructor(
    private readonly competencias: CompetenciasRepository,
    private readonly avisos: AvisosDoFechamento,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(
    usuarioId: string,
    competencia: string,
    opcoes: OpcoesFechamento = {},
  ): Promise<void> {
    const { status } = await situacaoDa(this.competencias, competencia);
    const novo = fechar(status);
    const em = this.agora();
    if (!mesAcabou(competencia, em)) throw new CompetenciaEmAndamentoError();

    const pendentes = await this.avisos.queImpedem(competencia, AVISOS_NA_RECUSA);
    const motivo = opcoes.motivoAvisos?.trim() || null;
    const podeComAvisos = opcoes.podeFecharComAvisos === true;
    if (pendentes.total > 0) {
      if (motivo && !podeComAvisos) throw new FecharComAvisosProibidoError();
      if (!motivo) throw new CompetenciaComAvisosError(pendentes, podeComAvisos);
    }
    const motivoGravado = pendentes.total > 0 ? motivo : null;

    if (!(await this.competencias.fechar(competencia, { usuarioId, em }, motivoGravado))) {
      throw new CompetenciaJaFechadaError();
    }
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: ENTIDADE_COMPETENCIA,
      entidadeId: competencia,
      acao: 'fechada',
      antes: { status },
      depois: motivoGravado
        ? {
            status: novo,
            comAvisos: {
              motivo: motivoGravado,
              total: pendentes.total,
              avisos: pendentes.itens.map((a) => a.id),
            },
          }
        : { status: novo },
      em,
    });
  }
}
