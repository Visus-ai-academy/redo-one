import { randomUUID } from 'node:crypto';

import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import type { AlocacaoVigente, DadosTurno } from './turno';
import type { FrenteDoTurno, TurnoGravado, TurnosRepository } from './turnos.repository';

const contem = (texto: string | null, busca: string) =>
  (texto ?? '').toLowerCase().includes(busca.toLowerCase());

/** Turnos em memória; `frentesExistentes` faz as vezes da tabela de frentes. */
export class InMemoryTurnosRepository implements TurnosRepository {
  readonly itens = new Map<string, DadosTurno & { id: string }>();
  /** Frentes que existem (id → rótulo). */
  readonly frentesExistentes = new Map<string, string>();
  /** Alocações por turno, com a data de fim (null = sem fim). */
  readonly alocacoes: (AlocacaoVigente & { turnoId: string; dataFim: string | null })[] = [];
  readonly emUso = new Set<string>();

  private gravado({ frenteIds, ...t }: DadosTurno & { id: string }): TurnoGravado {
    return {
      ...t,
      frentes: frenteIds.map((id) => ({ id, rotulo: this.frentesExistentes.get(id) ?? '' })),
    };
  }

  async listar(filtro: FiltroLista) {
    const filtrados = [...this.itens.values()]
      .filter((t) => filtro.ativo === undefined || t.ativo === filtro.ativo)
      .filter(
        (t) => !filtro.busca || contem(t.nome, filtro.busca) || contem(t.descricao, filtro.busca),
      )
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
    const inicio = (filtro.pagina - 1) * filtro.porPagina;
    return {
      itens: filtrados.slice(inicio, inicio + filtro.porPagina).map((t) => this.gravado(t)),
      total: filtrados.length,
    };
  }

  async buscar(id: string) {
    const t = this.itens.get(id);
    return t ? this.gravado(t) : null;
  }

  async buscarPorNome(nome: string) {
    const t = [...this.itens.values()].find((i) => i.nome.toLowerCase() === nome.toLowerCase());
    return t ? { id: t.id } : null;
  }

  async frentes(ids: string[]): Promise<FrenteDoTurno[]> {
    return ids
      .filter((id) => this.frentesExistentes.has(id))
      .map((id) => ({ id, rotulo: this.frentesExistentes.get(id) ?? '' }));
  }

  async alocacoesVigentes(turnoId: string, hoje: string) {
    return this.alocacoes
      .filter((a) => a.turnoId === turnoId && (a.dataFim === null || a.dataFim >= hoje))
      .map(({ frenteId, horarioInicio, horarioFim, gratificado }) => ({
        frenteId,
        horarioInicio,
        horarioFim,
        gratificado,
      }));
  }

  async criar(dados: DadosTurno) {
    const id = randomUUID();
    this.itens.set(id, { ...dados, id });
    return id;
  }

  async atualizar(id: string, dados: DadosTurno) {
    this.itens.set(id, { ...dados, id });
  }

  async excluir(id: string) {
    if (this.emUso.has(id)) return false;
    this.itens.delete(id);
    return true;
  }
}
