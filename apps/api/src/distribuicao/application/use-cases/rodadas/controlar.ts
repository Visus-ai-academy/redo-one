import { RecorteForaDoEscopoError, recorteDaGestora } from '../../../domain/rodada/escopo';
import {
  ajusteDeMedicos,
  aprovar,
  cancelar,
  encerrar,
  exigirProposta,
  pausar,
  reler,
  retomar,
  STATUS_VIVOS,
} from '../../../domain/rodada/maquina';
import type { Rodada } from '../../ports/rodadas.repository';
import {
  type AtorRodada,
  auditar,
  type DependenciasRodada,
  escopoDo,
  exigirNoEscopo,
  rodadaOuErro,
} from './comum';
import { RodadaRecusadaError } from './erros';

/** Base: carrega a rodada (com a expiração conferida) e confere o recorte da gestora. */
abstract class AcaoNaRodada {
  constructor(protected readonly d: DependenciasRodada) {}

  protected async rodada(ator: AtorRodada, id: string): Promise<Rodada> {
    const r = await rodadaOuErro(this.d, id);
    await exigirNoEscopo(this.d, ator, r, RecorteForaDoEscopoError);
    return r;
  }

  protected evento(id: string, texto: string) {
    return this.d.rodadas.registrarEvento(id, texto, this.d.agora());
  }
}

/** Libera a proposta para a execução (que é enfileirada na mesma transação). */
export class AprovarRodada extends AcaoNaRodada {
  async executar(ator: AtorRodada, id: string): Promise<void> {
    const r = await this.rodada(ator, id);
    const agora = this.d.agora();
    const status = aprovar(r, agora);
    const mudou = await this.d.rodadas.mudar(
      id,
      ['aguardando_aprovacao'],
      { status, aprovadaPorId: ator.usuarioId, aprovadaEm: agora },
      'executar',
    );
    if (!mudou)
      throw new RodadaRecusadaError('A rodada mudou enquanto você aprovava: confira de novo.');
    const { prevista } = await this.d.rodadas.contar(id);
    await this.evento(id, `Aprovada: ${prevista} exame(s) a atribuir.`);
    await auditar(this.d, ator, id, 'aprovada', { previstas: prevista });
  }
}

export interface AjusteProposta {
  /** Designações que saem da proposta. */
  remover: string[];
  /** Designações que mudam de médico. */
  mover: { designacaoId: string; medicoId: string }[];
}

/**
 * Ajustes de quem confere, antes de aprovar: tirar exame e mandar exame para outro médico ativo
 * (com conta na MobileMed). Só mexe no que está previsto.
 */
export class AjustarProposta extends AcaoNaRodada {
  async executar(ator: AtorRodada, id: string, ajuste: AjusteProposta): Promise<void> {
    const r = await this.rodada(ator, id);
    exigirProposta(r, this.d.agora());
    const remover = [...new Set(ajuste.remover)];
    const mover = ajuste.mover.filter((m) => !remover.includes(m.designacaoId));
    const destinos = await this.d.medicos.doCadastro([...new Set(mover.map((m) => m.medicoId))]);
    for (const m of mover) {
      const medico = destinos.get(m.medicoId);
      if (!medico?.ativo || medico.idMobilemed === null) {
        throw new RodadaRecusadaError(
          'Médico de destino não encontrado, inativo ou sem conta na MobileMed.',
        );
      }
    }
    const ids = [...remover, ...mover.map((m) => m.designacaoId)];
    const encontradas = await this.d.rodadas.designacoesPorId(id, ids);
    if (
      encontradas.length !== new Set(ids).size ||
      encontradas.some((x) => x.status !== 'prevista')
    ) {
      throw new RodadaRecusadaError('Só dá para ajustar exame previsto nesta proposta.');
    }
    const removidas = await this.d.rodadas.removerDaProposta(id, remover);
    const movidas = await this.d.rodadas.moverNaProposta(id, mover);
    const partes = [
      removidas && `${removidas} exame(s) tirado(s) da proposta`,
      movidas && `${movidas} exame(s) redirecionado(s)`,
    ].filter(Boolean);
    if (partes.length) await this.evento(id, `Ajuste na conferência: ${partes.join(' e ')}.`);
    await auditar(this.d, ator, id, 'proposta_ajustada', { removidas: remover, movidas: mover });
  }
}

export class PausarRodada extends AcaoNaRodada {
  async executar(ator: AtorRodada, id: string): Promise<void> {
    const r = await this.rodada(ator, id);
    const status = pausar(r);
    await this.d.rodadas.mudar(id, ['aprovada', 'executando'], { status });
    await this.evento(id, 'Distribuição pausada por quem acompanha.');
    await auditar(this.d, ator, id, 'pausada');
  }
}

/** Volta a distribuir o que falta; as falhas retentáveis voltam à fila junto. */
export class RetomarRodada extends AcaoNaRodada {
  async executar(ator: AtorRodada, id: string): Promise<void> {
    const r = await this.rodada(ator, id);
    const c = await this.d.rodadas.contar(id);
    const status = retomar(r, { restam: c.prevista + c.retentaveis });
    const voltaram = await this.d.rodadas.reenfileirarRetentaveis(id);
    await this.d.rodadas.mudar(id, [r.status], { status, erro: null }, 'executar');
    await this.evento(
      id,
      `Retomando: ${c.prevista + voltaram} exame(s) por atribuir${voltaram ? ` (${voltaram} que falharam voltaram à fila)` : ''}.`,
    );
    await auditar(this.d, ator, id, 'retomada', { reenfileiradas: voltaram });
  }
}

/** Aceita o que não foi atribuído: o feito conta, o resto fica para a próxima rodada. */
export class EncerrarRodada extends AcaoNaRodada {
  async executar(ator: AtorRodada, id: string): Promise<void> {
    const r = await this.rodada(ator, id);
    const status = encerrar(r);
    const deixados = await this.d.rodadas.pularPrevistas(
      id,
      'encerrada_pelo_operador',
      'Encerrada por quem acompanha: fica para a próxima rodada.',
    );
    await this.d.rodadas.mudar(id, STATUS_VIVOS, { status });
    const { executada } = await this.d.rodadas.contar(id);
    await this.evento(
      id,
      `Encerrada: ${executada} atribuído(s), ${deixados} deixado(s) para depois.`,
    );
    await auditar(this.d, ator, id, 'encerrada', { deixados });
  }
}

export class CancelarRodada extends AcaoNaRodada {
  async executar(ator: AtorRodada, id: string): Promise<void> {
    const r = await this.rodada(ator, id);
    const status = cancelar(r);
    const deixados = await this.d.rodadas.pularPrevistas(
      id,
      'rodada_cancelada',
      'A rodada foi cancelada antes de atribuir este exame.',
    );
    await this.d.rodadas.mudar(id, STATUS_VIVOS, { status });
    await this.evento(id, 'Rodada cancelada.');
    await auditar(this.d, ator, id, 'cancelada', { deixados });
  }
}

/** Lê a fila de novo na mesma rodada (a leitura anterior é descartada). */
export class RelerRodada extends AcaoNaRodada {
  async executar(ator: AtorRodada, id: string): Promise<void> {
    const r = await this.rodada(ator, id);
    const { executada } = await this.d.rodadas.contar(id);
    reler(r, { executadas: executada });
    await this.d.rodadas.reiniciarLeitura(id, [r.status]);
    await this.evento(id, 'Nova leitura pedida; a anterior foi descartada.');
    await auditar(this.d, ator, id, 'relida');
  }
}

/**
 * Tira ou inclui médicos na rodada. Antes da leitura só grava; com a proposta pronta, a fila é lida
 * de novo com o time novo.
 */
export class AjustarMedicosRodada extends AcaoNaRodada {
  async executar(
    ator: AtorRodada,
    id: string,
    pedido: { excluidos: string[]; incluidos: string[] },
  ): Promise<void> {
    const r = await this.rodada(ator, id);
    const excluidos = [...new Set(pedido.excluidos)];
    const incluidos = [...new Set(pedido.incluidos)].filter((m) => !excluidos.includes(m));
    const recortes = recorteDaGestora(await escopoDo(this.d, ator), {
      ...r.recortes,
      medicosExcluidos: excluidos,
      medicosIncluidos: incluidos,
    });
    const cadastro = await this.d.medicos.doCadastro([...excluidos, ...incluidos]);
    if (cadastro.size !== excluidos.length + incluidos.length) {
      throw new RodadaRecusadaError('Médico não encontrado.');
    }
    const { executada } = await this.d.rodadas.contar(id);
    const acao = ajusteDeMedicos(r, { executadas: executada });
    if (acao === 'gravar') {
      await this.d.rodadas.trocarMedicos(id, excluidos, incluidos);
    } else {
      await this.d.rodadas.reiniciarLeitura(id, [r.status], recortes);
    }
    await this.evento(
      id,
      `Médicos ajustados (${incluidos.length} incluído(s), ${excluidos.length} tirado(s))${acao === 'reler' ? '; a fila será lida de novo com eles.' : '.'}`,
    );
    await auditar(this.d, ator, id, 'medicos_ajustados', {
      medicosExcluidos: excluidos,
      medicosIncluidos: incluidos,
    });
  }
}
