import type { EventoAuditoria } from '../../auditoria/auditoria';
import type {
  AjusteGravado,
  AlocacaoGravada,
  AlocacoesRepository,
  TurnoParaAlocar,
} from './alocacoes.repository';

/** Repositório em memória: imita as cascatas do banco e guarda os eventos gravados. */
export class FakeAlocacoesRepository implements AlocacoesRepository {
  readonly alocacoes = new Map<string, AlocacaoGravada>();
  readonly ajustes = new Map<string, AjusteGravado>();
  readonly turnos = new Map<string, TurnoParaAlocar>();
  readonly medicos = new Map<string, { ativo: boolean }>();
  readonly prioridades = new Set<string>();
  readonly subespecialidades = new Set<string>();
  readonly eventos: EventoAuditoria[] = [];

  async buscar(id: string) {
    const a = this.alocacoes.get(id);
    return a ? structuredClone(a) : null;
  }

  async coberturasDe(titularId: string) {
    return [...this.alocacoes.values()].filter((a) => a.coberturaDeId === titularId);
  }

  async turno(id: string) {
    return this.turnos.get(id) ?? null;
  }

  async medico(id: string) {
    return this.medicos.get(id) ?? null;
  }

  async prioridadesExistentes(ids: string[]) {
    return ids.filter((id) => this.prioridades.has(id));
  }

  async subespecialidadesExistentes(ids: string[]) {
    return ids.filter((id) => this.subespecialidades.has(id));
  }

  async ajuste(alocacaoId: string, data: string) {
    return (
      [...this.ajustes.values()].find((a) => a.alocacaoId === alocacaoId && a.data === data) ?? null
    );
  }

  async ajustesDe(alocacaoIds: string[]) {
    return [...this.ajustes.values()].filter((a) => alocacaoIds.includes(a.alocacaoId));
  }

  async criar(alocacao: AlocacaoGravada, eventos: EventoAuditoria[]) {
    this.alocacoes.set(alocacao.id, structuredClone(alocacao));
    this.eventos.push(...eventos);
  }

  async atualizar(alocacao: AlocacaoGravada, eventos: EventoAuditoria[]) {
    this.alocacoes.set(alocacao.id, structuredClone(alocacao));
    this.eventos.push(...eventos);
  }

  async remover(id: string, eventos: EventoAuditoria[]) {
    const removidas = new Set([id, ...(await this.coberturasDe(id)).map((c) => c.id)]);
    for (const r of removidas) this.alocacoes.delete(r);
    for (const [chave, ajuste] of this.ajustes) {
      if (removidas.has(ajuste.alocacaoId)) this.ajustes.delete(chave);
    }
    this.eventos.push(...eventos);
  }

  async salvarAjuste(ajuste: AjusteGravado, eventos: EventoAuditoria[]) {
    this.ajustes.set(ajuste.id, { ...ajuste });
    this.eventos.push(...eventos);
  }

  async removerAjuste(id: string, eventos: EventoAuditoria[]) {
    this.ajustes.delete(id);
    this.eventos.push(...eventos);
  }
}
