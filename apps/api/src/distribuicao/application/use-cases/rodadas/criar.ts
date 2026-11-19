import type { RecortesRodada } from '../../../domain/rodada/entrada';
import { recorteDaGestora } from '../../../domain/rodada/escopo';
import {
  type AtorRodada,
  auditar,
  configuracaoAtual,
  type DependenciasRodada,
  escopoDo,
} from './comum';
import { RodadaRecusadaError, RodadaVivaError } from './erros';

const unicos = (ids: readonly string[]) => [...new Set(ids)];

function descricao(r: RecortesRodada): string {
  const partes = [
    r.turnoIds.length && `${r.turnoIds.length} turno(s)`,
    r.frenteIds.length && `${r.frenteIds.length} frente(s)`,
    r.prioridadeOperacaoIds.length && `${r.prioridadeOperacaoIds.length} prioridade(s)`,
    (r.subespecialidadeIds.length || r.subespecialidadeGeral) &&
      `${r.subespecialidadeIds.length + Number(r.subespecialidadeGeral)} subespecialidade(s)`,
    r.clienteIds.length && `${r.clienteIds.length} cliente(s)`,
    r.medicosExcluidos.length && `sem ${r.medicosExcluidos.length} médico(s)`,
    r.medicosIncluidos.length && `com ${r.medicosIncluidos.length} médico(s) a mais`,
  ].filter(Boolean);
  return partes.length ? ` (recorte: ${partes.join(', ')})` : '';
}

/**
 * "Distribuir agora": cria a rodada e enfileira a leitura da fila. Recusa com o robô desligado,
 * sem médico habilitado ou com outra rodada viva. Só manual por ora (decisão de 17/11/2026).
 */
export class CriarRodada {
  constructor(private readonly d: DependenciasRodada) {}

  async executar(ator: AtorRodada, pedido: RecortesRodada): Promise<string> {
    const config = await configuracaoAtual(this.d);
    if (!config.roboAtivo) {
      throw new RodadaRecusadaError('O robô está desligado em Configurações › Distribuição.');
    }
    if ((await this.d.medicos.habilitados()) === 0) {
      throw new RodadaRecusadaError(
        'Nenhum médico habilitado no robô: marque ao menos um na aba Distribuição do médico.',
      );
    }
    const agora = this.d.agora();
    await this.d.rodadas.expirarVencidas(agora);
    const viva = await this.d.rodadas.viva();
    if (viva) throw new RodadaVivaError(viva.status);

    const incluidos = unicos(pedido.medicosIncluidos);
    const excluidos = unicos(pedido.medicosExcluidos);
    const recortes = recorteDaGestora(await escopoDo(this.d, ator), {
      turnoIds: unicos(pedido.turnoIds),
      frenteIds: unicos(pedido.frenteIds),
      prioridadeOperacaoIds: unicos(pedido.prioridadeOperacaoIds),
      subespecialidadeIds: unicos(pedido.subespecialidadeIds),
      subespecialidadeGeral: pedido.subespecialidadeGeral,
      clienteIds: unicos(pedido.clienteIds),
      medicosExcluidos: excluidos,
      // Quem foi tirado não fica incluído.
      medicosIncluidos: incluidos.filter((m) => !excluidos.includes(m)),
    });
    const id = await this.d.rodadas.criar({
      solicitadaPorId: ator.usuarioId,
      recortes,
      evento: `Rodada pedida${descricao(recortes)}; aguardando a leitura da fila.`,
      agora,
    });
    await auditar(this.d, ator, id, 'criada', { ...recortes });
    return id;
  }
}
