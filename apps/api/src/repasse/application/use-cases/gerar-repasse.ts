import { calcularRepasse } from '../../domain/demonstrativo';
import type { DadosRepasse } from '../ports/dados-repasse';
import type { GeracoesRepasse } from '../ports/geracoes-repasse';
import type { RecalculoRepasse } from '../ports/recalculo-repasse';

export class RecalculoDeOutroContextoError extends Error {
  constructor() {
    super('O pedido de recálculo não é do repasse desta competência.');
  }
}

/**
 * Calcula e grava os demonstrativos de uma competência (o job). Aberta: a prévia, refeita a cada
 * importação ou mudança de configuração. Fechada: só com um pedido de recálculo (motivo, quem e
 * quando ficam no `faturamento`); o resultado vira versão nova e a anterior fica guardada.
 */
export class GerarRepasse {
  constructor(
    private readonly dados: DadosRepasse,
    private readonly geracoes: GeracoesRepasse,
    private readonly recalculos: RecalculoRepasse,
    private readonly agora: () => Date,
  ) {}

  async executar(pedido: {
    competencia: string;
    recalculoId?: string | null;
  }): Promise<'gerado' | 'ignorado'> {
    const { competencia } = pedido;
    const recalculoId = pedido.recalculoId ?? null;
    if (recalculoId) {
      const r = await this.recalculos.obter(recalculoId);
      if (r?.contexto !== 'repasse' || r.competencia !== competencia)
        throw new RecalculoDeOutroContextoError();
    }
    const situacao = await this.geracoes.situacao(competencia);
    if (situacao.status === 'fechada' && !recalculoId) return 'ignorado';

    const demonstrativos = calcularRepasse(await this.dados.carregar(competencia));
    const recalculo = situacao.status === 'fechada';
    await this.geracoes.gravar({
      competencia,
      tipo: recalculo ? 'recalculo' : 'previa',
      recalculoId: recalculo ? recalculoId : null,
      reabertaEm: situacao.reabertaEm,
      geradoEm: this.agora(),
      geradoPorId: null,
      demonstrativos,
    });
    if (recalculoId) await this.recalculos.concluir(recalculoId, this.agora());
    return 'gerado';
  }
}
