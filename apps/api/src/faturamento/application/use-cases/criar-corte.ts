import type { Auditoria } from '../../../auditoria/auditoria';
import { camposDoCorte } from '../../domain/vigencia-corte';
import type { CompetenciasRepository } from '../ports/competencias.repository';
import type { CortesRepository } from '../ports/cortes.repository';
import { type PedidoVigencia, prepararVigencia } from './preparar-vigencia';

/**
 * Cria a vigência do corte (padrão ou do cliente) e, na mesma transação, o job que recalcula a
 * competência dos laudos atingidos nas competências abertas. Só se cria vigência nova.
 */
export class CriarCorte {
  constructor(
    private readonly cortes: CortesRepository,
    private readonly competencias: CompetenciasRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, pedido: PedidoVigencia): Promise<string> {
    const vigencia = await prepararVigencia(pedido, this.cortes, this.competencias);
    const em = this.agora();
    const id = await this.cortes.criar(vigencia, { usuarioId, em });
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: 'corte_competencia',
      entidadeId: id,
      acao: 'criado',
      depois: {
        clienteId: vigencia.clienteId,
        desde: vigencia.desde,
        ...camposDoCorte(vigencia.corte),
      },
      em,
    });
    return id;
  }
}
