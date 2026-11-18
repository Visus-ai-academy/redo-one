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
import type { Designacao, MovimentoProposta, Rodada } from '../../ports/rodadas.repository';
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
  /**
   * Designações que mudam de médico. A prevista troca de destino; a que o motor deixou de fora é
   * mandada na mão. Com `levarPacote`, os outros exames do mesmo paciente que estavam juntos (mesmo
   * médico, ou também de fora) vão para o mesmo destino.
   */
  mover: { designacaoId: string; medicoId: string; levarPacote?: boolean }[];
  /** Desfaz o "tirar": volta para o médico de quem saiu. */
  restaurar?: string[];
}

/**
 * Ajustes de quem confere, antes de aprovar: tirar exame (e desfazer), mandar exame para outro
 * médico ativo (com conta na MobileMed), com ou sem o pacote do paciente, e mandar na mão o que o
 * motor deixou de fora.
 */
export class AjustarProposta extends AcaoNaRodada {
  async executar(ator: AtorRodada, id: string, ajuste: AjusteProposta): Promise<void> {
    const r = await this.rodada(ator, id);
    const agora = this.d.agora();
    exigirProposta(r, agora);
    const remover = [...new Set(ajuste.remover)];
    const restaurar = [...new Set(ajuste.restaurar ?? [])].filter((x) => !remover.includes(x));
    const mover = ajuste.mover.filter(
      (m) => !remover.includes(m.designacaoId) && !restaurar.includes(m.designacaoId),
    );
    const destinos = await this.d.medicos.doCadastro([...new Set(mover.map((m) => m.medicoId))]);
    for (const m of mover) {
      const medico = destinos.get(m.medicoId);
      if (!medico?.ativo || medico.idMobilemed === null) {
        throw new RodadaRecusadaError(
          'Médico de destino não encontrado, inativo ou sem conta na MobileMed.',
        );
      }
    }
    const ids = [...remover, ...restaurar, ...mover.map((m) => m.designacaoId)];
    const encontradas = new Map(
      (await this.d.rodadas.designacoesPorId(id, ids)).map((x) => [x.id, x]),
    );
    const invalida =
      encontradas.size !== new Set(ids).size ||
      remover.some((x) => encontradas.get(x)?.status !== 'prevista') ||
      mover.some(
        (m) => !['prevista', 'recusada'].includes(encontradas.get(m.designacaoId)?.status ?? ''),
      ) ||
      restaurar.some((x) => encontradas.get(x)?.retiradoDeId == null);
    if (invalida) {
      throw new RodadaRecusadaError(
        'Só dá para ajustar exame previsto ou deixado de fora nesta proposta.',
      );
    }

    const movimentos = new Map<string, MovimentoProposta>();
    for (const m of mover) {
      const origem = encontradas.get(m.designacaoId) as Designacao;
      const naMao = origem.status === 'recusada';
      movimentos.set(m.designacaoId, { designacaoId: m.designacaoId, medicoId: m.medicoId, naMao });
      if (!m.levarPacote) continue;
      for (const o of await this.d.rodadas.doMesmoPaciente(id, m.designacaoId)) {
        const junto = o.status === origem.status && (naMao || o.medicoId === origem.medicoId);
        if (junto && !remover.includes(o.id) && !movimentos.has(o.id)) {
          movimentos.set(o.id, { designacaoId: o.id, medicoId: m.medicoId, naMao });
        }
      }
    }

    const removidas = await this.d.rodadas.removerDaProposta(id, remover, agora);
    const restauradas = await this.d.rodadas.restaurarNaProposta(id, restaurar);
    const lista = [...movimentos.values()];
    const movidas = await this.d.rodadas.moverNaProposta(id, lista);
    const naMao = lista.filter((m) => m.naMao).length;
    const partes = [
      removidas && `${removidas} exame(s) tirado(s) da proposta`,
      restauradas && `${restauradas} devolvido(s) à proposta`,
      movidas - naMao > 0 && `${movidas - naMao} exame(s) redirecionado(s)`,
      naMao && `${naMao} exame(s) de fora mandado(s) na mão`,
    ].filter(Boolean);
    if (partes.length) await this.evento(id, `Ajuste na conferência: ${partes.join(', ')}.`);
    await auditar(this.d, ator, id, 'proposta_ajustada', {
      removidas: remover,
      restauradas: restaurar,
      movidas: lista,
    });
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
    await this.d.rodadas.mudar(id, [r.status], { status, erro: null, retomada: true }, 'executar');
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
