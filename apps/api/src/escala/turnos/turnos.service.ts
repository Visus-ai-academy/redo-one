import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import {
  ItemEmUsoError,
  ItemNaoEncontradoError,
  NomeEmUsoError,
  ReferenciaInexistenteError,
} from '../../catalogo/comum/catalogo.errors';
import type { Pagina } from '../../catalogo/comum/paginacao';
import { type AtorCatalogo, RegistroAuditoria } from '../../catalogo/comum/registro-auditoria';
import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import { CLOCK, type Clock } from '../../identidade/clock';
import { duracaoMinutos } from '../domain/horario';
import { type DadosTurno, normalizarTurno, verificarMudancaDoTurno } from './turno';
import { TURNOS_REPOSITORY, type TurnoGravado, type TurnosRepository } from './turnos.repository';

export const ROTULO_TURNO = { entidade: 'turno', singular: 'Turno', genero: 'm' } as const;

/** O turno como a tela recebe: com as frentes e a duração em minutos. */
export interface Turno extends TurnoGravado {
  duracaoMin: number;
}

/** Brasília não tem horário de verão desde 2019: UTC−3 fixo. */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;
const diaEmBrasilia = (instante: Date) =>
  new Date(instante.getTime() - OFFSET_BRASILIA_MS).toISOString().slice(0, 10);

/**
 * Turnos da escala (a caixa de horário) e as frentes de cada um, escolhidas entre as
 * especialidades e modalidades do catálogo.
 */
@Injectable()
export class TurnosService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(TURNOS_REPOSITORY) private readonly repo: TurnosRepository,
    @Inject(AUDITORIA) auditoria: Auditoria,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO_TURNO, auditoria, clock);
  }

  async listar(filtro: FiltroLista): Promise<Pagina<Turno>> {
    const { itens, total } = await this.repo.listar(filtro);
    return { itens: itens.map(comDuracao), total };
  }

  async obter(id: string): Promise<Turno> {
    return comDuracao(await this.buscar(id));
  }

  async criar(ator: AtorCatalogo, entrada: DadosTurno): Promise<string> {
    const dados = await this.validar(entrada, null);
    const { id, frenteIds } = await this.repo.criar(dados);
    await this.registro.criado(ator, id, { ...dados, frenteIds });
    return id;
  }

  async atualizar(ator: AtorCatalogo, id: string, entrada: DadosTurno): Promise<void> {
    const atual = await this.buscar(id);
    const antes = gravados(atual);
    const dados = await this.validar(entrada, id);
    const vigentes = await this.repo.alocacoesVigentes(id, diaEmBrasilia(this.clock.now()));
    verificarMudancaDoTurno(atual, dados, vigentes, atual.frentes);
    const { frenteIds } = await this.repo.atualizar(id, dados);
    await this.registro.alterado(ator, id, antes, { ...dados, frenteIds });
  }

  async excluir(ator: AtorCatalogo, id: string): Promise<void> {
    const antes = gravados(await this.buscar(id));
    if (!(await this.repo.excluir(id))) throw new ItemEmUsoError(ROTULO_TURNO);
    await this.registro.excluido(ator, id, antes);
  }

  private async buscar(id: string): Promise<TurnoGravado> {
    const turno = await this.repo.buscar(id);
    if (!turno) throw new ItemNaoEncontradoError(ROTULO_TURNO);
    return turno;
  }

  private async validar(entrada: DadosTurno, idAtual: string | null): Promise<DadosTurno> {
    const dados = normalizarTurno(entrada);
    const mesmoNome = await this.repo.buscarPorNome(dados.nome);
    if (mesmoNome && mesmoNome.id !== idAtual) throw new NomeEmUsoError(ROTULO_TURNO, dados.nome);
    const existentes = await this.repo.noCatalogo(dados);
    if (
      existentes.especialidadeIds.length !== dados.especialidadeIds.length ||
      existentes.modalidadeIds.length !== dados.modalidadeIds.length
    ) {
      throw new ReferenciaInexistenteError();
    }
    return dados;
  }
}

function comDuracao(turno: TurnoGravado): Turno {
  return { ...turno, duracaoMin: duracaoMinutos(turno.horarioInicio, turno.horarioFim) };
}

/** O que se audita: os dados do turno e os ids das frentes, ordenados. */
function gravados({
  id: _,
  frentes,
  ...turno
}: TurnoGravado): DadosTurno & { frenteIds: string[] } {
  return { ...turno, frenteIds: frentes.map((f) => f.id).sort() };
}
