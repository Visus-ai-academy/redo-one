import { Inject, Injectable } from '@nestjs/common';

import type { EventoAuditoria } from '../../auditoria/auditoria';
import {
  ItemEmUsoError,
  ItemNaoEncontradoError,
  NomeEmUsoError,
  ReferenciaInexistenteError,
} from '../../catalogo/comum/catalogo.errors';
import type { Pagina } from '../../catalogo/comum/paginacao';
import type { AtorCatalogo } from '../../catalogo/comum/registro-auditoria';
import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import { CLOCK, type Clock } from '../../identidade/clock';
import { diferenca } from '../alocacoes/eventos';
import { duracaoMinutos } from '../domain/horario';
import { diaEmBrasilia } from '../domain/ocorrencias';
import { type DadosTurno, normalizarTurno, verificarMudancaDoTurno } from './turno';
import { TURNOS_REPOSITORY, type TurnoGravado, type TurnosRepository } from './turnos.repository';

export const ROTULO_TURNO = { entidade: 'turno', singular: 'Turno', genero: 'm' } as const;

/** O turno como a tela recebe: com as frentes e a duração em minutos. */
export interface Turno extends TurnoGravado {
  duracaoMin: number;
}

/** Aviso da edição do turno (não bloqueia). */
export interface AvisoTurno {
  /** `turno_inativo_com_alocacoes`: o turno foi inativado com alocações vigentes. */
  codigo: 'turno_inativo_com_alocacoes';
  mensagem: string;
  totalAlocacoes: number;
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * Turnos da escala (a caixa de horário) e as frentes de cada um, escolhidas entre as
 * especialidades e modalidades do catálogo.
 */
@Injectable()
export class TurnosService {
  constructor(
    @Inject(TURNOS_REPOSITORY) private readonly repo: TurnosRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async listar(filtro: FiltroLista): Promise<Pagina<Turno>> {
    const { itens, total } = await this.repo.listar(filtro);
    return { itens: itens.map(comDuracao), total };
  }

  async obter(id: string): Promise<Turno> {
    return comDuracao(await this.buscar(id));
  }

  /** Grava o turno e o evento de auditoria na mesma transação. */
  async criar(ator: AtorCatalogo, entrada: DadosTurno): Promise<string> {
    const dados = await this.validar(entrada, null);
    const { id } = await this.repo.criar(dados, ({ id, frenteIds }) => [
      this.evento(ator, id, 'criado', undefined, { ...dados, frenteIds }),
    ]);
    return id;
  }

  /**
   * Edita (auditoria na mesma transação). Inativar com alocações vigentes não bloqueia: devolve
   * um aviso com a contagem (de hoje em diante elas deixam de gerar plantão).
   */
  async atualizar(
    ator: AtorCatalogo,
    id: string,
    entrada: DadosTurno,
  ): Promise<{ avisos: AvisoTurno[] }> {
    const atual = await this.buscar(id);
    const antes = gravados(atual);
    const dados = await this.validar(entrada, id);
    const vigentes = await this.repo.alocacoesVigentes(id, diaEmBrasilia(this.clock.now()));
    verificarMudancaDoTurno(atual, dados, vigentes, atual.frentes);
    await this.repo.atualizar(id, dados, ({ frenteIds }) => {
      const mudancas = diferenca({ ...antes }, { ...dados, frenteIds });
      return mudancas ? [this.evento(ator, id, 'alterado', mudancas.antes, mudancas.depois)] : [];
    });
    return { avisos: atual.ativo && !dados.ativo ? avisoDeInativacao(vigentes.length) : [] };
  }

  async excluir(ator: AtorCatalogo, id: string): Promise<void> {
    const antes = gravados(await this.buscar(id));
    const evento = this.evento(ator, id, 'excluido', antes);
    if (!(await this.repo.excluir(id, [evento]))) throw new ItemEmUsoError(ROTULO_TURNO);
  }

  private evento(
    ator: AtorCatalogo,
    id: string,
    acao: string,
    antes?: object,
    depois?: object,
  ): EventoAuditoria {
    return {
      ator: { tipo: 'usuario', id: ator.usuarioId },
      entidade: ROTULO_TURNO.entidade,
      entidadeId: id,
      acao,
      ...(antes ? { antes: { ...antes } } : {}),
      ...(depois ? { depois: { ...depois } } : {}),
      em: this.clock.now(),
    };
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

function avisoDeInativacao(total: number): AvisoTurno[] {
  if (total === 0) return [];
  return [
    {
      codigo: 'turno_inativo_com_alocacoes',
      totalAlocacoes: total,
      mensagem: `O turno tem ${total} ${plural(total, 'alocação vigente', 'alocações vigentes')}: a partir de hoje ${plural(total, 'ela deixa', 'elas deixam')} de gerar plantão. Encerre ou mova ${plural(total, 'essa alocação', 'essas alocações')}.`,
    },
  ];
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
