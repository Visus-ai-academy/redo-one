import type {
  ConsultaRodadas,
  ContagemPorMedico,
  ContagemPorMotivo,
  DesignacaoDetalhada,
  FiltroDesignacoes,
  FiltroHistorico,
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
  EntregaRegistrada,
  EventoRodada,
  MovimentoProposta,
  MudancaRodada,
  ResultadoDesignacao,
  Rodada,
  RodadasRepository,
  TarefaRodada,
  UltimaEntrega,
} from '../application/ports/rodadas.repository';
import { RodadaVivaError } from '../application/use-cases/rodadas/erros';
import type { CatalogoDaFila, InsumosRodada, RecortesRodada } from '../domain/rodada/entrada';
import { estaViva, type StatusRodada } from '../domain/rodada/maquina';
import type { DesignacaoNova, InsumosGravados, StatusDesignacao } from '../domain/rodada/proposta';

export interface DesignacaoGravada extends Omit<DesignacaoNova, 'status'> {
  id: string;
  rodadaId: string;
  status: StatusDesignacao;
  retentavel: boolean;
  executadaEm: Date | null;
  retiradoDeId: string | null;
  retiradaEm: Date | null;
}

/** Repositório das rodadas na memória, com as tarefas enfileiradas à vista. */
export class RodadasEmMemoria implements RodadasRepository, ConsultaRodadas {
  readonly rodadas = new Map<string, Rodada>();
  designacoesGravadas: DesignacaoGravada[] = [];
  readonly diario: (EventoRodada & { rodadaId: string })[] = [];
  readonly jobs: { tarefa: TarefaRodada; rodadaId: string }[] = [];
  readonly insumosGravados = new Map<string, InsumosGravados>();
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
      recolhidos: 0,
      urgentes: 0,
      recortes: d.recortes,
      retomadas: 0,
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
    const { retomada, ...mudanca } = m;
    Object.assign(r, mudanca);
    if (retomada) r.retomadas++;
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
        retiradoDeId: null,
        retiradaEm: null,
      });
    }
    Object.assign(r, {
      status: 'aguardando_aprovacao',
      avisos: p.avisos,
      lidos: p.lidos,
      recolhidos: p.recolhidos,
      urgentes: p.urgentes,
      lidaEm: p.lidaEm,
      expiraEm: p.expiraEm,
      erro: null,
    });
    this.insumosGravados.set(id, p.insumos);
    return true;
  }

  async reiniciarLeitura(id: string, de: readonly StatusRodada[], recortes?: RecortesRodada) {
    const r = this.rodadas.get(id);
    if (!r || !de.includes(r.status)) return false;
    this.designacoesGravadas = this.designacoesGravadas.filter((d) => d.rodadaId !== id);
    Object.assign(r, {
      status: 'solicitada',
      erro: null,
      expiraEm: null,
      lidos: 0,
      recolhidos: 0,
      urgentes: 0,
    });
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
    pacienteChave: d.pacienteChave,
    retiradoDeId: d.retiradoDeId,
    recolhidoDeId: d.recolhidoDeId,
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

  async insumos(id: string) {
    return this.insumosGravados.get(id) ?? null;
  }

  async doMesmoPaciente(rodadaId: string, designacaoId: string) {
    const d = this.daRodada(rodadaId).find((x) => x.id === designacaoId);
    if (!d) return [];
    return this.daRodada(rodadaId)
      .filter((x) => x.id !== d.id && x.pacienteChave === d.pacienteChave)
      .map(this.comoDesignacao);
  }

  async removerDaProposta(rodadaId: string, ids: readonly string[], agora: Date) {
    let n = 0;
    for (const d of this.daRodada(rodadaId)) {
      if (ids.includes(d.id) && d.status === 'prevista') {
        Object.assign(d, {
          status: 'pulada',
          retiradoDeId: d.medicoId,
          retiradaEm: agora,
          medicoId: null,
          motivo: 'removido_na_conferencia',
          detalhe: 'Tirado da proposta na conferência.',
        });
        n++;
      }
    }
    return n;
  }

  async restaurarNaProposta(rodadaId: string, ids: readonly string[]) {
    let n = 0;
    for (const d of this.daRodada(rodadaId)) {
      if (ids.includes(d.id) && d.status === 'pulada' && d.retiradoDeId) {
        Object.assign(d, {
          status: 'prevista',
          medicoId: d.retiradoDeId,
          retiradoDeId: null,
          retiradaEm: null,
          motivo: null,
          detalhe: null,
        });
        n++;
      }
    }
    return n;
  }

  async moverNaProposta(rodadaId: string, mover: readonly MovimentoProposta[]) {
    let n = 0;
    for (const m of mover) {
      const d = this.daRodada(rodadaId).find((x) => x.id === m.designacaoId);
      if (d?.status === 'prevista' || (m.naMao && d?.status === 'recusada')) {
        Object.assign(d, { medicoId: m.medicoId, status: 'prevista', naMao: d.naMao || m.naMao });
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
    const mapa = new Map<string, EntregaRegistrada[]>();
    const somar = (id: string, e: EntregaRegistrada) => mapa.set(id, [...(mapa.get(id) ?? []), e]);
    for (const d of this.designacoesGravadas) {
      if (!idsExame.includes(d.idExame)) continue;
      if (d.status === 'executada' && d.medicoId && d.executadaEm && d.executadaEm >= desde) {
        somar(d.idExame, { medicoId: d.medicoId, em: d.executadaEm, origem: 'execucao' });
        if (d.recolhidoDeId) {
          somar(d.idExame, {
            medicoId: d.recolhidoDeId,
            em: d.executadaEm,
            origem: 'recolhimento',
          });
        }
      }
      if (d.retiradoDeId && d.retiradaEm && d.retiradaEm >= desde) {
        somar(d.idExame, { medicoId: d.retiradoDeId, em: d.retiradaEm, origem: 'conferencia' });
      }
    }
    return mapa;
  }

  async ultimasEntregas(idsExame: readonly string[]) {
    const mapa = new Map<string, UltimaEntrega>();
    for (const d of this.designacoesGravadas) {
      if (!idsExame.includes(d.idExame) || d.status !== 'executada') continue;
      if (!d.medicoId || !d.executadaEm) continue;
      const atual = mapa.get(d.idExame);
      if (!atual || atual.em < d.executadaEm) {
        mapa.set(d.idExame, { medicoId: d.medicoId, em: d.executadaEm });
      }
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
  private detalhada = (d: DesignacaoGravada): DesignacaoDetalhada => {
    const rotulo = (id: string | null) => (id ? { id, nome: id } : null);
    const doPaciente = this.daRodada(d.rodadaId).filter((x) => x.pacienteChave === d.pacienteChave);
    return {
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
      pacote:
        doPaciente.length > 1 ? { id: doPaciente[0]?.id ?? d.id, exames: doPaciente.length } : null,
      gratificado: d.gratificado,
      naMao: d.naMao,
      elegiveis: d.elegiveis,
      retiradoDe: rotulo(d.retiradoDeId),
      retiradaEm: d.retiradaEm,
      recolhidoDe: rotulo(d.recolhidoDeId),
      motivoRecolhimento: d.motivoRecolhimento,
      status: d.status,
      motivo: d.motivo,
      detalhe: d.detalhe,
      executadaEm: d.executadaEm,
    };
  };

  async designacoes(rodadaId: string, f: FiltroDesignacoes) {
    const todas = this.daRodada(rodadaId)
      .filter((d) => !f.status?.length || f.status.includes(d.status))
      .filter((d) => !f.medicoId || d.medicoId === f.medicoId)
      .filter((d) => !f.motivo?.length || f.motivo.includes(d.motivo ?? ''))
      .filter((d) => f.naMao === undefined || d.naMao === f.naMao)
      .filter((d) => f.recolhido === undefined || (d.recolhidoDeId !== null) === f.recolhido)
      .sort((a, b) => a.ordem - b.ordem);
    const itens = todas
      .slice((f.pagina - 1) * f.porPagina, f.pagina * f.porPagina)
      .map(this.detalhada);
    return { itens, total: todas.length };
  }

  async designacaoExplicada(rodadaId: string, designacaoId: string) {
    const d = this.daRodada(rodadaId).find((x) => x.id === designacaoId);
    return d ? { ...this.detalhada(d), barrados: d.barrados } : null;
  }

  async porMedico(rodadaId: string): Promise<ContagemPorMedico[]> {
    const mapa = new Map<string, ContagemPorMedico>();
    const pacientes = new Map<string, Map<string, number>>();
    for (const d of this.daRodada(rodadaId)) {
      if (!d.medicoId) continue;
      const c = mapa.get(d.medicoId) ?? {
        medicoId: d.medicoId,
        nome: d.medicoId,
        propostos: 0,
        urgencias: 0,
        pacotes: 0,
        previstas: 0,
        executadas: 0,
        puladas: 0,
        falharam: 0,
        naMao: 0,
      };
      c.propostos++;
      if (d.urgente) c.urgencias++;
      if (d.status === 'prevista') c.previstas++;
      if (d.status === 'executada') c.executadas++;
      if (d.status === 'pulada') c.puladas++;
      if (d.status === 'falhou') c.falharam++;
      if (d.naMao) c.naMao++;
      const p = pacientes.get(d.medicoId) ?? new Map<string, number>();
      p.set(d.pacienteChave, (p.get(d.pacienteChave) ?? 0) + 1);
      pacientes.set(d.medicoId, p);
      c.pacotes = [...p.values()].filter((n) => n > 1).length;
      mapa.set(d.medicoId, c);
    }
    return [...mapa.values()];
  }

  async porMotivo(rodadaId: string): Promise<ContagemPorMotivo[]> {
    const mapa = new Map<string, ContagemPorMotivo>();
    for (const d of this.daRodada(rodadaId)) {
      if (d.status === 'prevista' || d.status === 'executada') continue;
      const k = `${d.status}|${d.motivo}`;
      const c = mapa.get(k) ?? { status: d.status, motivo: d.motivo, quantidade: 0 };
      c.quantidade++;
      mapa.set(k, c);
    }
    return [...mapa.values()];
  }

  async ajustes(rodadaId: string) {
    const ds = this.daRodada(rodadaId);
    return {
      tirados: ds.filter((d) => d.motivo === 'removido_na_conferencia').length,
      movidos: ds.filter(
        (d) => !d.naMao && d.medicoId && d.medicoPropostoId && d.medicoId !== d.medicoPropostoId,
      ).length,
      naMao: ds.filter((d) => d.naMao).length,
    };
  }

  async nomesMedicos(ids: readonly string[]) {
    return new Map(ids.map((id) => [id, id]));
  }

  async historico(f: FiltroHistorico) {
    const todas = [...this.rodadas.values()]
      .reverse()
      .filter((r) => !f.status?.length || f.status.includes(r.status));
    const { pagina, porPagina } = f;
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
        recolhidos: r.recolhidos,
        propostos: this.daRodada(r.id).filter((d) => d.medicoPropostoId).length,
        executadas: this.daRodada(r.id).filter((d) => d.status === 'executada').length,
        deFora: this.daRodada(r.id).filter((d) => d.status === 'recusada').length,
        atualizadoEm: r.criadoEm,
        recortes: r.recortes,
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

  async buscar(termo: string, limite: number) {
    const t = termo.toLowerCase();
    return this.medicos
      .filter((m) => m.ativo && m.idMobilemed !== null && m.nome.toLowerCase().includes(t))
      .slice(0, limite);
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
