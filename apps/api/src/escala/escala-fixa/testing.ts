import type { EventoAuditoria } from '../../auditoria/auditoria';
import { FakeAlocacoesRepository } from '../alocacoes/testing';
import type {
  AlocacaoFixa,
  EscalaFixaRepository,
  GravadoNaEscalaFixa,
  MudancasEscalaFixa,
} from './escala-fixa.repository';

/** Em memória, sobre o fake das alocações (mesmas cascatas e eventos). */
export class FakeEscalaFixaRepository
  extends FakeAlocacoesRepository
  implements EscalaFixaRepository
{
  async fixasDoMedico(medicoId: string, frenteId: string): Promise<AlocacaoFixa[]> {
    return [...this.alocacoes.values()]
      .filter(
        (a) =>
          a.medicoId === medicoId &&
          a.frenteId === frenteId &&
          a.dataFim === null &&
          a.coberturaDeId === null,
      )
      .sort((x, y) => x.dataInicio.localeCompare(y.dataInicio))
      .map((a) => {
        const turno = this.turnos.get(a.turnoId);
        return {
          ...structuredClone(a),
          horarioDoTurno: {
            horarioInicio: turno?.horarioInicio ?? '',
            horarioFim: turno?.horarioFim ?? '',
          },
        };
      });
  }

  async definir(
    medicoId: string,
    frenteId: string,
    planejar: (fixas: AlocacaoFixa[]) => MudancasEscalaFixa,
    eventosDe: (gravado: GravadoNaEscalaFixa) => EventoAuditoria[],
  ) {
    const mudancas = planejar(await this.fixasDoMedico(medicoId, frenteId));
    const gravado: GravadoNaEscalaFixa = {
      criadas: mudancas.criar,
      encerradas: [],
      removidas: [],
      ajustesRemovidos: [],
    };
    for (const id of mudancas.remover) {
      const removida = this.alocacoes.get(id);
      if (!removida) continue;
      const cascata = [removida, ...(await this.coberturasDe(id))];
      const ids = new Set(cascata.map((a) => a.id));
      const ajustes = [...this.ajustes.values()].filter((aj) => ids.has(aj.alocacaoId));
      for (const r of ids) this.alocacoes.delete(r);
      for (const aj of ajustes) this.ajustes.delete(aj.id);
      gravado.removidas.push(...cascata);
      gravado.ajustesRemovidos.push(...ajustes);
    }
    for (const { id, dataFim } of mudancas.encerrar) {
      const antes = this.alocacoes.get(id);
      if (!antes) continue;
      const depois = { ...antes, dataFim };
      this.alocacoes.set(id, depois);
      gravado.encerradas.push({ antes, depois });
    }
    for (const a of mudancas.criar) this.alocacoes.set(a.id, structuredClone(a));
    this.eventos.push(...eventosDe(gravado));
  }
}
