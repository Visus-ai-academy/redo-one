import { CompetenciaNaoEncontradaError } from '../../domain/competencia-status';
import { exigirCompetencia } from '../../domain/vigencia-corte';
import type { CompetenciasRepository, SituacaoCompetencia } from '../ports/competencias.repository';

/** Situação da competência pedida; recusa formato inválido e competência sem linha. */
export async function situacaoDa(
  competencias: CompetenciasRepository,
  competencia: string,
): Promise<SituacaoCompetencia> {
  exigirCompetencia(competencia);
  const situacao = await competencias.obter(competencia);
  if (!situacao) throw new CompetenciaNaoEncontradaError();
  return situacao;
}

export const ENTIDADE_COMPETENCIA = 'competencia';
