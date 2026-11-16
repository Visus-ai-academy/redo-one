import { randomUUID } from 'node:crypto';

import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import type { DestinosFrentes } from '../frentes/garantir-frentes';
import type { AlocacaoVigente, DadosTurno, FrenteDoTurno } from './turno';
import type { TurnoGravado, TurnosRepository } from './turnos.repository';

const contem = (texto: string | null, busca: string) =>
  (texto ?? '').toLowerCase().includes(busca.toLowerCase());

/**
 * Turnos em memória. `especialidades` e `modalidades` fazem as vezes do catálogo (id → nome ou
 * código); a frente de cada item tem o id `f-<nome em minúsculas>`.
 */
export class InMemoryTurnosRepository implements TurnosRepository {
  readonly itens = new Map<string, DadosTurno & { id: string }>();
  readonly especialidades = new Map<string, string>();
  readonly modalidades = new Map<string, string>();
  /** Alocações por turno, com a data de fim (null = sem fim). */
  readonly alocacoes: (AlocacaoVigente & { turnoId: string; dataFim: string | null })[] = [];
  readonly emUso = new Set<string>();

  private frentesDe(dados: DadosTurno): FrenteDoTurno[] {
    const frente = (
      tipo: FrenteDoTurno['tipo'],
      catalogoId: string,
      rotulo: string,
    ): FrenteDoTurno => ({
      id: `f-${rotulo.toLowerCase()}`,
      rotulo,
      tipo,
      especialidadeId: tipo === 'especialidade' ? catalogoId : null,
      modalidadeId: tipo === 'modalidade' ? catalogoId : null,
    });
    const porNome = (a: FrenteDoTurno, b: FrenteDoTurno) => a.rotulo.localeCompare(b.rotulo);
    return [
      ...dados.especialidadeIds
        .map((id) => frente('especialidade', id, this.especialidades.get(id) ?? ''))
        .sort(porNome),
      ...dados.modalidadeIds
        .map((id) => frente('modalidade', id, this.modalidades.get(id) ?? ''))
        .sort(porNome),
    ];
  }

  private gravado(t: DadosTurno & { id: string }): TurnoGravado {
    return { ...t, frentes: this.frentesDe(t) };
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

  async noCatalogo({ especialidadeIds, modalidadeIds }: DestinosFrentes) {
    return {
      especialidadeIds: especialidadeIds.filter((id) => this.especialidades.has(id)),
      modalidadeIds: modalidadeIds.filter((id) => this.modalidades.has(id)),
    };
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
    return {
      id,
      frenteIds: this.frentesDe(dados)
        .map((f) => f.id)
        .sort(),
    };
  }

  async atualizar(id: string, dados: DadosTurno) {
    this.itens.set(id, { ...dados, id });
    return {
      frenteIds: this.frentesDe(dados)
        .map((f) => f.id)
        .sort(),
    };
  }

  async excluir(id: string) {
    if (this.emUso.has(id)) return false;
    this.itens.delete(id);
    return true;
  }
}
