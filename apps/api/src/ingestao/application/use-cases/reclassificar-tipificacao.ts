import type { Tipificacao } from '../../../faturamento/domain/tipificacao';
import type { LeitorCadastrosIngestao } from '../ports/cadastros-ingestao';
import type { CompetenciasBloqueadas } from '../ports/competencias-bloqueadas';
import type { LaudosRepository, ReclassificacaoLaudo } from '../ports/laudos.repository';
import type { LeitorTipificacao } from '../ports/tipificacao-laudos';
import type { PedidoRecalculo } from './recalcular-competencias';

/** Laudos por lote: lidos e gravados de cada vez. */
const LOTE = 5000;

const igual = (a: Tipificacao | null, b: Tipificacao) =>
  a !== null && a.regraId === b.regraId && a.subregraId === b.subregraId && a.fatura === b.fatura;

/**
 * Reclassifica a tipificação dos laudos das competências abertas quando a configuração muda (dos
 * clientes pedidos; nulo = todos). Também preenche a unidade de origem pela empresa, para os
 * laudos gravados antes dela. Bloqueadas e configuração são lidas na hora de rodar; laudo de
 * competência fechada ou travada não muda. Idempotente: só grava o que mudou.
 */
export class ReclassificarTipificacao {
  constructor(
    private readonly laudos: LaudosRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly cadastros: LeitorCadastrosIngestao,
    private readonly tipificacao: LeitorTipificacao,
    private readonly agora: () => Date,
  ) {}

  async executar({ clienteIds }: PedidoRecalculo): Promise<{ lidos: number; alterados: number }> {
    const [tipificar, cadastros, iniciais] = await Promise.all([
      this.tipificacao.carregar(),
      this.cadastros.carregar(),
      this.competencias.listar(),
    ]);
    if (!tipificar) return { lidos: 0, alterados: 0 };
    let bloqueadas = iniciais;
    let lidos = 0;
    let alterados = 0;
    let depoisDe: string | null = null;

    for (;;) {
      const lote = await this.laudos.lerParaReclassificacao({
        clienteIds,
        competenciasBloqueadas: bloqueadas,
        depoisDe,
        limite: LOTE,
      });
      lidos += lote.length;
      // Relidas a cada lote: a competência fechada durante a execução não muda mais a partir daqui.
      bloqueadas = await this.competencias.listar();
      const bloqueada = new Set(bloqueadas);
      const mudancas = lote.flatMap((l): ReclassificacaoLaudo[] => {
        if (bloqueada.has(l.competencia)) return [];
        // A unidade só pela empresa que ainda leva ao mesmo principal gravado.
        const unidadeId =
          l.clienteId && cadastros.resolverCliente(l.empresaOrigem) === l.clienteId
            ? cadastros.resolverUnidade(l.empresaOrigem)
            : l.unidadeId;
        const tipificacao = tipificar({ ...l, unidadeId });
        return unidadeId === l.unidadeId && igual(l.tipificacao, tipificacao)
          ? []
          : [{ id: l.id, unidadeId, tipificacao }];
      });
      if (mudancas.length) {
        await this.laudos.gravarReclassificacao(mudancas, bloqueadas, this.agora());
        alterados += mudancas.length;
      }
      if (lote.length < LOTE) break;
      depoisDe = lote[lote.length - 1]?.id ?? null;
    }
    return { lidos, alterados };
  }
}
