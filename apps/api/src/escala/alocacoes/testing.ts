import type { EventoAuditoria } from '../../auditoria/auditoria';
import { EscalaInvalidaError } from '../domain';
import type {
  AjusteGravado,
  AlocacaoGravada,
  AlocacoesRepository,
  ConferirCoberturas,
  EventosDaRemocao,
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

  async criarCobertura(
    cobertura: AlocacaoGravada,
    eventos: EventoAuditoria[],
    conferir: ConferirCoberturas,
  ) {
    conferir(await this.coberturasDoTitular(cobertura));
    await this.criar(cobertura, eventos);
  }

  async atualizarCobertura(
    cobertura: AlocacaoGravada,
    eventos: EventoAuditoria[],
    conferir: ConferirCoberturas,
  ) {
    conferir(await this.coberturasDoTitular(cobertura));
    await this.atualizar(cobertura, eventos);
  }

  async remover(id: string, eventosDe: EventosDaRemocao) {
    const atual = this.alocacoes.get(id);
    if (!atual) return;
    const removidas = [structuredClone(atual), ...(await this.coberturasDe(id))];
    const ids = new Set(removidas.map((a) => a.id));
    const ajustes = [...this.ajustes.values()].filter((a) => ids.has(a.alocacaoId));
    const eventos = eventosDe(removidas, ajustes);
    for (const r of ids) this.alocacoes.delete(r);
    for (const aj of ajustes) this.ajustes.delete(aj.id);
    this.eventos.push(...eventos);
  }

  private async coberturasDoTitular(cobertura: AlocacaoGravada) {
    const titularId = cobertura.coberturaDeId ?? '';
    if (!this.alocacoes.has(titularId)) {
      throw new EscalaInvalidaError('O vínculo coberto não existe mais.');
    }
    return this.coberturasDe(titularId);
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
