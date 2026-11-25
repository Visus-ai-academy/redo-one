import type { EventoAuditoria } from '../../auditoria/auditoria';
import type { Pagina, Paginacao } from '../../catalogo/comum/paginacao';
import { type EscopoEscala, estaNoEscopo } from '../escopo/escopo';
import type {
  AlocacaoDoMedico,
  AusenciaDetalhada,
  AusenciasRepository,
  DadosAusenciaGravada,
  FiltroAusencias,
  NovaAusencia,
  RevisaoGravada,
  TipoAusenciaCadastro,
} from './ausencias.repository';

/** Alocação no fake: o período decide se vale para o recorte. */
export interface AlocacaoFake extends AlocacaoDoMedico {
  dataInicio: string;
  dataFim: string | null;
}

type AusenciaFake = NovaAusencia & {
  motivoRecusa: string | null;
  revisadaPorId: string | null;
  revisadaEm: Date | null;
  criadoEm: Date;
};

/** Repositório de ausências em memória, com o mesmo recorte da gestora do banco. */
export class FakeAusenciasRepository implements AusenciasRepository {
  readonly medicos = new Map<string, string>();
  readonly tipos = new Map<string, TipoAusenciaCadastro & { nome: string; cor: string | null }>();
  readonly frentes = new Map<string, string>();
  readonly turnos = new Map<string, string>();
  readonly usuarios = new Map<string, { nome: string; medicoId: string | null }>();
  readonly alocacoes: AlocacaoFake[] = [];
  readonly ausencias = new Map<string, AusenciaFake>();
  readonly eventos: EventoAuditoria[] = [];

  async listar(filtro: FiltroAusencias): Promise<Pagina<AusenciaDetalhada>> {
    const termo = filtro.busca?.toLowerCase();
    const todas = [...this.ausencias.values()]
      .filter((a) => this.visivel(a, filtro.escopo))
      .filter((a) => !filtro.situacao || a.situacao === filtro.situacao)
      .filter((a) => !filtro.tipoId || a.tipoId === filtro.tipoId)
      .filter((a) => !filtro.medicoId || a.medicoId === filtro.medicoId)
      .filter((a) => !filtro.frenteId || a.todasFrentes || a.frenteIds.includes(filtro.frenteId))
      .filter((a) => !termo || (this.medicos.get(a.medicoId) ?? '').toLowerCase().includes(termo))
      .filter((a) => a.dataFim >= filtro.de && (!filtro.ate || a.dataInicio <= filtro.ate))
      .sort(
        (x, y) =>
          Number(y.situacao === 'pendente') - Number(x.situacao === 'pendente') ||
          y.dataInicio.localeCompare(x.dataInicio) ||
          x.id.localeCompare(y.id),
      );
    const inicio = (filtro.pagina - 1) * filtro.porPagina;
    return {
      itens: todas.slice(inicio, inicio + filtro.porPagina).map((a) => this.detalhar(a)),
      total: todas.length,
    };
  }

  async buscar(id: string) {
    const ausencia = this.ausencias.get(id);
    return ausencia ? this.detalhar(ausencia) : null;
  }

  async contarPendentes(escopo: EscopoEscala | null) {
    return [...this.ausencias.values()].filter(
      (a) => a.situacao === 'pendente' && this.visivel(a, escopo),
    ).length;
  }

  async doMedico(medicoId: string, { pagina, porPagina }: Paginacao) {
    const todas = [...this.ausencias.values()]
      .filter((a) => a.medicoId === medicoId)
      .sort((x, y) => y.dataInicio.localeCompare(x.dataInicio));
    const inicio = (pagina - 1) * porPagina;
    return {
      itens: todas.slice(inicio, inicio + porPagina).map((a) => this.detalhar(a)),
      total: todas.length,
    };
  }

  async tipo(id: string) {
    const tipo = this.tipos.get(id);
    return tipo ? { id: tipo.id, soGestor: tipo.soGestor, ativo: tipo.ativo } : null;
  }

  async medicosExistentes(ids: string[]) {
    return ids.filter((id) => this.medicos.has(id));
  }

  async frentesExistentes(ids: string[]) {
    return ids.filter((id) => this.frentes.has(id));
  }

  async turnosExistentes(ids: string[]) {
    return ids.filter((id) => this.turnos.has(id));
  }

  async alocacoesVigentes(medicoIds: string[], dataInicio: string, dataFim: string) {
    return this.alocacoes
      .filter((a) => medicoIds.includes(a.medicoId) && vigente(a, dataInicio, dataFim))
      .map(({ medicoId, turnoId, frenteId }) => ({ medicoId, turnoId, frenteId }));
  }

  async medicoDoUsuario(usuarioId: string) {
    return this.usuarios.get(usuarioId)?.medicoId ?? null;
  }

  async criar(novas: NovaAusencia[], eventos: EventoAuditoria[]) {
    for (const nova of novas) {
      this.ausencias.set(nova.id, {
        ...nova,
        motivoRecusa: null,
        revisadaPorId: null,
        revisadaEm: null,
        criadoEm: new Date(),
      });
    }
    this.eventos.push(...eventos);
  }

  async atualizar(id: string, dados: DadosAusenciaGravada, evento: EventoAuditoria) {
    const atual = this.ausencias.get(id);
    if (!atual) return;
    this.ausencias.set(id, { ...atual, ...dados });
    this.eventos.push(evento);
  }

  async revisar(id: string, revisao: RevisaoGravada, evento: EventoAuditoria) {
    const atual = this.ausencias.get(id);
    if (atual?.situacao !== 'pendente') return false;
    this.ausencias.set(id, { ...atual, ...revisao });
    this.eventos.push(evento);
    return true;
  }

  async excluir(id: string, evento: EventoAuditoria, opcoes?: { somentePendente?: boolean }) {
    const atual = this.ausencias.get(id);
    if (!atual || (opcoes?.somentePendente && atual.situacao !== 'pendente')) return false;
    this.ausencias.delete(id);
    this.eventos.push(evento);
    return true;
  }

  /** Para os testes: cópia de uma ausência com outro id e campos trocados. */
  copiar(id: string, novoId: string, mudancas: Partial<AusenciaFake> = {}) {
    const original = this.ausencias.get(id);
    if (!original) throw new Error(`Ausência ${id} não existe no fake.`);
    this.ausencias.set(novoId, { ...original, ...mudancas, id: novoId });
  }

  private visivel(a: AusenciaFake, escopo: EscopoEscala | null) {
    if (!escopo) return true;
    return this.alocacoes.some(
      (al) =>
        al.medicoId === a.medicoId &&
        vigente(al, a.dataInicio, a.dataFim) &&
        estaNoEscopo(escopo, al),
    );
  }

  private detalhar(a: AusenciaFake): AusenciaDetalhada {
    const tipo = this.tipos.get(a.tipoId);
    const usuario = (id: string | null) =>
      id && this.usuarios.has(id) ? { id, nome: this.usuarios.get(id)?.nome ?? '' } : null;
    return {
      id: a.id,
      medico: { id: a.medicoId, nome: this.medicos.get(a.medicoId) ?? '' },
      tipo: { id: a.tipoId, nome: tipo?.nome ?? '', cor: tipo?.cor ?? null },
      dataInicio: a.dataInicio,
      dataFim: a.dataFim,
      todosDias: a.todosDias,
      diasSemana: a.diasSemana,
      todasFrentes: a.todasFrentes,
      frentes: a.frenteIds.map((id) => ({ id, nome: this.frentes.get(id) ?? '' })),
      todosTurnos: a.todosTurnos,
      turnos: a.turnoIds.map((id) => ({ id, nome: this.turnos.get(id) ?? '' })),
      situacao: a.situacao,
      origem: a.origem,
      observacoes: a.observacoes,
      motivoRecusa: a.motivoRecusa,
      solicitadaPor: usuario(a.solicitadaPorId),
      revisadaPor: usuario(a.revisadaPorId),
      revisadaEm: a.revisadaEm,
      criadoEm: a.criadoEm,
    };
  }
}

function vigente(a: { dataInicio: string; dataFim: string | null }, de: string, ate: string) {
  return a.dataInicio <= ate && (a.dataFim === null || a.dataFim >= de);
}
