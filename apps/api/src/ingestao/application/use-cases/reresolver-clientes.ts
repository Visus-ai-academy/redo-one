import type { LeitorCadastrosIngestao } from '../ports/cadastros-ingestao';
import type { CompetenciasBloqueadas } from '../ports/competencias-bloqueadas';
import type { ClienteDoLaudo, LaudosRepository } from '../ports/laudos.repository';

/** Laudos por lote: lidos e gravados de cada vez. */
const LOTE = 5000;

/**
 * Resolve de novo o cliente e a unidade de origem dos laudos das competências abertas quando o
 * cadastro que decide a resolução muda (apelido, sufixo, nome, unificação): pela empresa, como a
 * importação, inclusive dos laudos removidos e dos que estão fora da janela de reimportação.
 * Bloqueadas e cadastro são lidos na hora de rodar; laudo de competência fechada ou travada não
 * muda. Idempotente: só grava o que mudou. A gravação refaz os totais e enfileira o recálculo da
 * competência e a reclassificação da tipificação dos laudos que mudaram.
 */
export class ReresolverClientes {
  constructor(
    private readonly laudos: LaudosRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly cadastros: LeitorCadastrosIngestao,
    private readonly agora: () => Date,
  ) {}

  async executar(): Promise<{ lidos: number; alterados: number }> {
    const [cadastros, iniciais] = await Promise.all([
      this.cadastros.carregar(),
      this.competencias.listar(),
    ]);
    let bloqueadas = iniciais;
    let lidos = 0;
    let alterados = 0;
    let depoisDe: string | null = null;

    for (;;) {
      const lote = await this.laudos.lerParaReclassificacao({
        clienteIds: null,
        competenciasBloqueadas: bloqueadas,
        depoisDe,
        limite: LOTE,
      });
      lidos += lote.length;
      // Relidas a cada lote: a competência fechada durante a execução não muda mais a partir daqui.
      bloqueadas = await this.competencias.listar();
      const bloqueada = new Set(bloqueadas);
      const mudancas = lote.flatMap((l): ClienteDoLaudo[] => {
        if (bloqueada.has(l.competencia)) return [];
        const clienteId = cadastros.resolverCliente(l.empresaOrigem);
        const unidadeId = clienteId ? cadastros.resolverUnidade(l.empresaOrigem) : null;
        return clienteId === l.clienteId && unidadeId === l.unidadeId
          ? []
          : [{ id: l.id, clienteId, unidadeId }];
      });
      if (mudancas.length) {
        await this.laudos.gravarClientes(mudancas, bloqueadas, this.agora());
        alterados += mudancas.length;
      }
      if (lote.length < LOTE) break;
      depoisDe = lote[lote.length - 1]?.id ?? null;
    }
    return { lidos, alterados };
  }
}
