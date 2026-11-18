import type {
  ConsultaRodadas,
  DesignacaoDetalhada,
  FiltroDesignacoes,
} from '../application/ports/consulta-rodadas';
import type {
  EscopoDoAtor,
  EscopoRodada,
  LeitorInsumosRodada,
  MedicoDaConta,
  MedicosRodada,
} from '../application/ports/insumos-rodada';
import type {
  ContagemDesignacoes,
  Designacao,
  EventoRodada,
  MudancaRodada,
  ResultadoDesignacao,
  Rodada,
  RodadasRepository,
  TarefaRodada,
} from '../application/ports/rodadas.repository';
import { RodadaVivaError } from '../application/use-cases/rodadas/erros';
import type { CatalogoDaFila, InsumosRodada, RecortesRodada } from '../domain/rodada/entrada';
import { estaViva, type StatusRodada } from '../domain/rodada/maquina';
import type { DesignacaoNova, StatusDesignacao } from '../domain/rodada/proposta';

export interface DesignacaoGravada extends Omit<DesignacaoNova, 'status'> {
  id: string;
  rodadaId: string;
  status: StatusDesignacao;
  retentavel: boolean;
  executadaEm: Date | null;
}

/** Repositório das rodadas na memória, com as tarefas enfileiradas à vista. */
export class RodadasEmMemoria implements RodadasRepository, ConsultaRodadas {
  readonly rodadas = new Map<string, Rodada>();
  designacoesGravadas: DesignacaoGravada[] = [];
  readonly diario: (EventoRodada & { rodadaId: string })[] = [];
  readonly jobs: { tarefa: TarefaRodada; rodadaId: string }[] = [];
  readonly insumos = new Map<string, unknown>();
  private seq = 0;

  async criar(d: {
    solicitadaPorId: string;
    recortes: RecortesRodada;
    evento: string;
    agora: Date;
  }) {
    if ([...this.rodadas.values()].some((r) => estaViva(r.status))) throw new RodadaVivaError();
    const id = `rod-${++this.seq}`;
    this.rodadas.set(id, {
      id,
      status: 'solicitada',
      solicitadaPorId: d.solicitadaPorId,
      aprovadaPorId: null,
      aprovadaEm: null,
      criadoEm: d.agora,
      lidaEm: null,
      expiraEm: null,
      erro: null,
      avisos: [],
      lidos: 0,
      urgentes: 0,
      recortes: d.recortes,
    });
    this.diario.push({ rodadaId: id, em: d.agora, texto: d.evento, atual: null, total: null });
    this.jobs.push({ tarefa: 'ler', rodadaId: id });
    return id;
  }

  async obter(id: string) {
    const r = this.rodadas.get(id);
    return r ? { ...r } : null;
  }

  async viva() {
    return [...this.rodadas.values()].find((r) => estaViva(r.status)) ?? null;
  }

  async expirarVencidas(agora: Date) {
    let n = 0;
    for (const r of this.rodadas.values()) {
      if (r.status === 'aguardando_aprovacao' && r.expiraEm && r.expiraEm < agora) {
        r.status = 'expirada';
        n++;
      }
    }
    return n;
  }

  async mudar(
    id: string,
    de: readonly StatusRodada[],
    m: MudancaRodada,
    enfileirar?: TarefaRodada,
  ) {
    const r = this.rodadas.get(id);
    if (!r || !de.includes(r.status)) return false;
    Object.assign(r, m);
    if (enfileirar) this.jobs.push({ tarefa: enfileirar, rodadaId: id });
    return true;
  }

  async gravarProposta(
    id: string,
    p: Parameters<RodadasRepository['gravarProposta']>[1],
  ): Promise<boolean> {
    const r = this.rodadas.get(id);
    if (r?.status !== 'lendo' || !r) return false;
    this.designacoesGravadas = this.designacoesGravadas.filter((d) => d.rodadaId !== id);
    for (const d of p.designacoes) {
      this.designacoesGravadas.push({
        ...d,
        id: `${id}:${d.idExame}`,
        rodadaId: id,
        retentavel: false,
        executadaEm: null,
      });
    }
    Object.assign(r, {
      status: 'aguardando_aprovacao',
      avisos: p.avisos,
      lidos: p.lidos,
      urgentes: p.urgentes,
      lidaEm: p.lidaEm,
      expiraEm: p.expiraEm,
      erro: null,
    });
    this.insumos.set(id, p.insumos);
    return true;
  }

  async reiniciarLeitura(id: string, de: readonly StatusRodada[], recortes?: RecortesRodada) {
    const r = this.rodadas.get(id);
    if (!r || !de.includes(r.status)) return false;
    this.designacoesGravadas = this.designacoesGravadas.filter((d) => d.rodadaId !== id);
    Object.assign(r, { status: 'solicitada', erro: null, expiraEm: null, lidos: 0, urgentes: 0 });
    if (recortes) r.recortes = recortes;
    this.jobs.push({ tarefa: 'ler', rodadaId: id });
    return true;
  }

  async trocarMedicos(id: string, excluidos: string[], incluidos: string[]) {
    const r = this.rodadas.get(id);
    if (r) r.recortes = { ...r.recortes, medicosExcluidos: excluidos, medicosIncluidos: incluidos };
  }

  private daRodada(id: string) {
    return this.designacoesGravadas.filter((d) => d.rodadaId === id);
  }

  async contar(id: string): Promise<ContagemDesignacoes> {
    const c = { prevista: 0, executada: 0, pulada: 0, falhou: 0, recusada: 0, retentaveis: 0 };
    for (const d of this.daRodada(id)) {
      c[d.status]++;
      if (d.retentavel && (d.status === 'pulada' || d.status === 'falhou')) c.retentaveis++;
    }
    return c;
  }

  private comoDesignacao = (d: DesignacaoGravada): Designacao => ({
    id: d.id,
    ordem: d.ordem,
    idExameMobilemed: d.idExame,
    medicoId: d.medicoId,
    status: d.status,
    posicao: d.posicao,
    urgente: d.urgente,
    prazo: d.prazo,
    entradaEm: d.entradaEm,
    clienteId: d.clienteId,
    especialidadeId: d.especialidadeId,
    modalidadeId: d.modalidadeId,
  });

  async previstas(id: string) {
    return this.daRodada(id)
      .filter((d) => d.status === 'prevista')
      .map(this.comoDesignacao);
  }

  async designacoesPorId(rodadaId: string, ids: readonly string[]) {
    return this.daRodada(rodadaId)
      .filter((d) => ids.includes(d.id))
      .map(this.comoDesignacao);
  }

  async removerDaProposta(rodadaId: string, ids: readonly string[]) {
    let n = 0;
    for (const d of this.daRodada(rodadaId)) {
      if (ids.includes(d.id) && d.status === 'prevista') {
        Object.assign(d, { status: 'pulada', medicoId: null, motivo: 'removido_na_conferencia' });
        n++;
      }
    }
    return n;
  }

  async moverNaProposta(
    rodadaId: string,
    mover: readonly { designacaoId: string; medicoId: string }[],
  ) {
    let n = 0;
    for (const m of mover) {
      const d = this.daRodada(rodadaId).find((x) => x.id === m.designacaoId);
      if (d?.status === 'prevista') {
        d.medicoId = m.medicoId;
        n++;
      }
    }
    return n;
  }

  async registrarResultado(id: string, r: ResultadoDesignacao, agora: Date) {
    const d = this.designacoesGravadas.find((x) => x.id === id);
    if (d?.status !== 'prevista' || !d) return false;
    Object.assign(d, { ...r, executadaEm: r.status === 'executada' ? agora : null });
    return true;
  }

  async pularPrevistas(rodadaId: string, motivo: string, detalhe: string) {
    let n = 0;
    for (const d of this.daRodada(rodadaId)) {
      if (d.status === 'prevista') {
        Object.assign(d, { status: 'pulada', motivo, detalhe });
        n++;
      }
    }
    return n;
  }

  async reenfileirarRetentaveis(rodadaId: string) {
    let n = 0;
    for (const d of this.daRodada(rodadaId)) {
      if (d.retentavel && (d.status === 'pulada' || d.status === 'falhou')) {
        Object.assign(d, { status: 'prevista', motivo: null, detalhe: null, retentavel: false });
        n++;
      }
    }
    return n;
  }

  async registrarEvento(
    rodadaId: string,
    texto: string,
    em: Date,
    progresso?: { atual: number; total: number },
  ) {
    const ultimo = this.diario.filter((e) => e.rodadaId === rodadaId).at(-1);
    if (progresso && ultimo?.total != null) this.diario.splice(this.diario.indexOf(ultimo), 1);
    this.diario.push({
      rodadaId,
      em,
      texto,
      atual: progresso?.atual ?? null,
      total: progresso?.total ?? null,
    });
  }

  async eventos(rodadaId: string, limite: number) {
    return this.diario
      .filter((e) => e.rodadaId === rodadaId)
      .slice(-limite)
      .map(({ rodadaId: _, ...e }) => e);
  }

  async entregues(idsExame: readonly string[], desde: Date) {
    const mapa = new Map<string, { medicoId: string; em: Date }[]>();
    for (const d of this.designacoesGravadas) {
      if (d.status !== 'executada' || !d.medicoId || !d.executadaEm) continue;
      if (!idsExame.includes(d.idExame) || d.executadaEm < desde) continue;
      mapa.set(d.idExame, [
        ...(mapa.get(d.idExame) ?? []),
        { medicoId: d.medicoId, em: d.executadaEm },
      ]);
    }
    return mapa;
  }

  async cotaEntregue(plantoes: readonly { alocacaoId: string; desde: Date }[]) {
    const cota: Record<string, number> = {};
    for (const p of plantoes) {
      const feitos = this.designacoesGravadas.filter(
        (d) =>
          d.status === 'executada' &&
          d.alocacaoGratificadaId === p.alocacaoId &&
          (d.executadaEm ?? new Date(0)) >= p.desde,
      );
      if (feitos.length) cota[p.alocacaoId] = feitos.reduce((s, d) => s + d.laudos, 0);
    }
    return cota;
  }

  // --- consulta ---
  async designacoes(rodadaId: string, f: FiltroDesignacoes) {
    const todas = this.daRodada(rodadaId)
      .filter((d) => !f.status?.length || f.status.includes(d.status))
      .filter((d) => !f.medicoId || d.medicoId === f.medicoId)
      .sort((a, b) => a.ordem - b.ordem);
    const rotulo = (id: string | null) => (id ? { id, nome: id } : null);
    const itens = todas.slice((f.pagina - 1) * f.porPagina, f.pagina * f.porPagina).map(
      (d): DesignacaoDetalhada => ({
        id: d.id,
        ordem: d.ordem,
        idExameMobilemed: d.idExame,
        estudo: d.estudo,
        unidade: d.unidade,
        cliente: rotulo(d.clienteId),
        prioridadeGrafia: d.prioridadeGrafia,
        prioridadeOperacao: rotulo(d.prioridadeOperacaoId),
        especialidade: rotulo(d.especialidadeId),
        modalidade: rotulo(d.modalidadeId),
        subespecialidade: rotulo(d.subespecialidadeId),
        laudos: d.laudos,
        realizadoEm: d.realizadoEm,
        prazo: d.prazo,
        urgente: d.urgente,
        medicoProposto: rotulo(d.medicoPropostoId),
        medico: rotulo(d.medicoId),
        agrupadoCom: d.agrupadoCom,
        gratificado: d.gratificado,
        status: d.status,
        motivo: d.motivo,
        detalhe: d.detalhe,
        executadaEm: d.executadaEm,
      }),
    );
    return { itens, total: todas.length };
  }

  async historico(pagina: number, porPagina: number) {
    const todas = [...this.rodadas.values()].reverse();
    return {
      itens: todas.slice((pagina - 1) * porPagina, pagina * porPagina).map((r) => ({
        id: r.id,
        status: r.status,
        criadoEm: r.criadoEm,
        solicitadaPor: r.solicitadaPorId
          ? { id: r.solicitadaPorId, nome: r.solicitadaPorId }
          : null,
        aprovadaPor: r.aprovadaPorId ? { id: r.aprovadaPorId, nome: r.aprovadaPorId } : null,
        aprovadaEm: r.aprovadaEm,
        lidos: r.lidos,
        executadas: this.daRodada(r.id).filter((d) => d.status === 'executada').length,
      })),
      total: todas.length,
    };
  }

  async nomesUsuarios(ids: readonly string[]) {
    return new Map(ids.map((id) => [id, `Usuário ${id}`]));
  }
}

export class MedicosRodadaEmMemoria implements MedicosRodada {
  constructor(public medicos: MedicoDaConta[] = []) {}

  async habilitados() {
    return this.medicos.filter((m) => m.ativo && m.habilitadoRobo).length;
  }

  async doCadastro(ids: readonly string[]) {
    return new Map(this.medicos.filter((m) => ids.includes(m.id)).map((m) => [m.id, m]));
  }
}

export class EscopoEmMemoria implements EscopoRodada {
  readonly escopos = new Map<string, EscopoDoAtor>();

  async doUsuario(usuarioId: string) {
    return this.escopos.get(usuarioId) ?? null;
  }
}

export class InsumosFixos implements LeitorInsumosRodada {
  readonly instantes: Date[] = [];

  constructor(
    public insumos: InsumosRodada,
    public catalogo: CatalogoDaFila,
  ) {}

  async carregar(agora: Date) {
    this.instantes.push(agora);
    return { insumos: this.insumos, catalogo: this.catalogo };
  }
}
