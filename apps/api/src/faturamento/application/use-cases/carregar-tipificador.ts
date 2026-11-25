import type { LeitorTipificacao } from '../../../ingestao/application/ports/tipificacao-laudos';
import {
  montarTipificadorPorCompetencia,
  type TipificadorPorCompetencia,
} from '../../domain/tipificacao';
import type { EquipesMedicos } from '../ports/equipes-medicos';
import type { TipificacaoRepository } from '../ports/tipificacao.repository';

/**
 * A tipificação configurada, pronta para classificar pela competência do laudo: as versões das
 * regras, sub-regras e da configuração de cada cliente, e os membros das equipes. É a porta `TIPIFICACAO_LAUDOS` da `ingestao`.
 */
export class CarregarTipificador implements LeitorTipificacao {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly equipes: EquipesMedicos,
  ) {}

  async carregar(): Promise<TipificadorPorCompetencia | null> {
    const [config, membros] = await Promise.all([
      this.repo.carregarConfiguracao(),
      this.equipes.membros(),
    ]);
    return config ? montarTipificadorPorCompetencia({ ...config, equipes: membros }) : null;
  }
}
