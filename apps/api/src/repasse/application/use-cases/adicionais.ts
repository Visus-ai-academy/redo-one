import { ErroDeDominio } from '../../../comum/erro-de-dominio';
import {
  AdicionalInvalidoError,
  montarAdicional,
  type PedidoAdicional,
  PeerReviewJaPagoError,
} from '../../domain/adicional';
import { competenciaDestino } from '../../domain/vigencia';
import type { AdicionaisRepository, AdicionalGravado } from '../ports/adicionais.repository';
import type { AgendadorRepasse } from '../ports/agendador-repasse';
import type { RecalculoRepasse } from '../ports/recalculo-repasse';

export class MedicoNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Médico não encontrado.');
  }
}

export class AdicionalNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Lançamento não encontrado.');
  }
}

export class AdicionalCanceladoError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super('O lançamento já foi cancelado.');
  }
}

export class LancarNaFechadaSemPermissaoError extends ErroDeDominio {
  readonly tipo = 'proibido';
  constructor() {
    super(
      'Sem permissão para lançar na competência fechada: o lançamento iria para a próxima aberta.',
    );
  }
}

export class CancelarNaFechadaError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super(
      'A competência do lançamento está fechada: lance o valor contrário (na próxima aberta ou, com justificativa, na fechada).',
    );
  }
}

interface Competencias {
  fechadas(): Promise<string[]>;
}

export interface PedidoLancamento extends PedidoAdicional {
  medicoId: string;
  /** Lançar na própria competência fechada (permissão própria, com motivo): recalcula ela. */
  lancarNaFechada?: boolean;
  motivo?: string;
}

/**
 * Lança crédito ou débito avulso (ou Peer Review / Plantão por quantidade). Na competência aberta,
 * a prévia é refeita. Pedido numa fechada vai, por padrão, para a próxima aberta; com a permissão
 * própria e motivo, fica na fechada e pede o recálculo dela (o mecanismo do `faturamento`).
 */
export class LancarAdicional {
  constructor(
    private readonly repo: AdicionaisRepository,
    private readonly competencias: Competencias,
    private readonly recalculo: RecalculoRepasse,
    private readonly agendador: AgendadorRepasse,
    private readonly agora: () => Date,
  ) {}

  async executar(
    ator: { usuarioId: string; podeLancarNaFechada: boolean },
    pedido: PedidoLancamento,
  ): Promise<{ id: string; competencia: string; recalculoId: string | null }> {
    if (!(await this.repo.medicoExiste(pedido.medicoId))) throw new MedicoNaoEncontradoError();
    const fechadas = await this.competencias.fechadas();
    const fechada = fechadas.includes(pedido.competencia);
    const naFechada = fechada && pedido.lancarNaFechada === true;
    if (naFechada && !ator.podeLancarNaFechada) throw new LancarNaFechadaSemPermissaoError();
    const motivo = (pedido.motivo ?? '').trim();
    if (naFechada && !motivo)
      throw new AdicionalInvalidoError(
        'Informe o motivo de lançar na competência fechada: ele fica no histórico do recálculo.',
      );
    const competencia = naFechada
      ? pedido.competencia
      : competenciaDestino(pedido.competencia, fechadas);
    const montado = montarAdicional(
      { ...pedido, competencia },
      await this.repo.tarifas(competencia),
    );
    if (montado.tipo === 'peer_review') {
      const ja = await this.repo.peerReviewSobreposto(
        pedido.medicoId,
        montado.referenciaDesde as string,
        montado.referenciaAte as string,
      );
      if (ja) throw new PeerReviewJaPagoError(ja);
    }
    const id = await this.repo.inserir({
      ...montado,
      medicoId: pedido.medicoId,
      lancadoPorId: ator.usuarioId,
      lancadoEm: this.agora(),
    });
    if (!naFechada) {
      await this.agendador.previa(competencia);
      return { id, competencia, recalculoId: null };
    }
    const recalculoId = await this.recalculo.solicitar(ator.usuarioId, competencia, motivo);
    await this.repo.ligarRecalculo(id, recalculoId);
    return { id, competencia, recalculoId };
  }
}

/** Cancela o lançamento (fica registrado, nunca se apaga) na competência aberta. */
export class CancelarAdicional {
  constructor(
    private readonly repo: AdicionaisRepository,
    private readonly competencias: Competencias,
    private readonly agendador: AgendadorRepasse,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, id: string, motivo: string): Promise<void> {
    const a = await this.repo.obter(id);
    if (!a) throw new AdicionalNaoEncontradoError();
    if (a.canceladoEm) throw new AdicionalCanceladoError();
    if ((await this.competencias.fechadas()).includes(a.competencia))
      throw new CancelarNaFechadaError();
    const limpo = motivo.trim();
    if (!limpo) throw new AdicionalInvalidoError('Informe o motivo do cancelamento.');
    await this.repo.cancelar(id, usuarioId, this.agora(), limpo);
    await this.agendador.previa(a.competencia);
  }
}

export class ListarAdicionais {
  constructor(private readonly repo: AdicionaisRepository) {}

  executar(competencia: string): Promise<AdicionalGravado[]> {
    return this.repo.listar(competencia);
  }
}
