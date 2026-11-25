import type { EventoAuditoria } from '../../auditoria/auditoria';
import type { Segmento } from '../../comum/segmentos';
import type {
  AjusteDiaLido,
  AjustesDiaRepository,
  FiltroAjustesDia,
  MudancaAjustesDia,
} from '../application/ports/ajustes-dia.repository';
import type { ArranjosRepository, Dono } from '../application/ports/arranjos.repository';
import type {
  CadastrosDistribuicao,
  Referencias,
  TipoReferencia,
} from '../application/ports/cadastros-distribuicao';
import type { ConfiguracaoDistribuicaoRepository } from '../application/ports/configuracao-distribuicao.repository';
import type {
  AlocacaoDoAjuste,
  AtorEscala,
  EscalaDoAjuste,
} from '../application/ports/escala-do-ajuste';
import type {
  ExcecaoRecebimentoGravavel,
  ExcecoesRecebimentoRepository,
} from '../application/ports/excecoes-recebimento.repository';
import type {
  ParametrosEquipe,
  ParametrosEquipeRepository,
} from '../application/ports/parametros-equipe.repository';
import {
  PARAMETROS_MEDICO_PADRAO,
  type ParametrosMedico,
  type ParametrosMedicoRepository,
} from '../application/ports/parametros-medico.repository';
import type { PrioridadesClienteRepository } from '../application/ports/prioridades-cliente.repository';
import type { PrioridadesOperacaoRepository } from '../application/ports/prioridades-operacao.repository';
import type { RegrasFrenteRepository } from '../application/ports/regras-frente.repository';
import type {
  RetratoFilaGravado,
  RetratoFilaRepository,
} from '../application/ports/retrato-fila.repository';
import type { FilaDoMomento } from '../application/use-cases/rodadas/consultas';
import type { AjusteDiaDistribuicao } from '../domain/ajuste-dia';
import type { Arranjo, FrenteEscala } from '../domain/arranjo';
import type { ConfiguracaoGlobal } from '../domain/configuracao-global';
import type { RegrasFrente } from '../domain/motor/configuracao';
import type {
  CelulaRecebimento,
  ExcecaoRecebimento,
  PrioridadeOperacao,
} from '../domain/motor/prioridades-operacao';
import type { PrioridadeDaFrente } from '../domain/prioridade-cliente';
import type { EdicaoPrioridadeOperacao } from '../domain/prioridades-operacao';

export class ArranjosEmMemoria implements ArranjosRepository {
  readonly porDono = new Map<string, Arranjo[]>();
  substituicoes = 0;

  async listar(dono: Dono) {
    return structuredClone(this.porDono.get(`${dono.tipo}:${dono.id}`) ?? []);
  }

  async substituir(dono: Dono, arranjos: Arranjo[]) {
    this.substituicoes++;
    this.porDono.set(`${dono.tipo}:${dono.id}`, structuredClone(arranjos));
  }
}

export class ParametrosMedicoEmMemoria implements ParametrosMedicoRepository {
  readonly itens = new Map<string, ParametrosMedico>();

  async obter(medicoId: string) {
    return this.itens.get(medicoId) ?? { ...PARAMETROS_MEDICO_PADRAO };
  }

  async salvar(medicoId: string, parametros: ParametrosMedico) {
    this.itens.set(medicoId, { ...parametros });
  }
}

export class ParametrosEquipeEmMemoria implements ParametrosEquipeRepository {
  readonly itens = new Map<string, ParametrosEquipe>();

  async obter(equipeId: string) {
    const p = this.itens.get(equipeId);
    return p ? { ...p } : null;
  }

  async salvar(equipeId: string, parametros: ParametrosEquipe) {
    this.itens.set(equipeId, { ...parametros });
  }
}

export class CadastrosEmMemoria implements CadastrosDistribuicao {
  readonly medicos = new Set<string>();
  readonly equipes = new Set<string>();
  readonly frentes = new Map<string, FrenteEscala>();
  readonly nomes = new Map<string, string>();
  readonly segmentosCadastrados: Segmento[] = [];

  async segmentos(ids: readonly string[]) {
    return this.segmentosCadastrados.filter((s) => ids.includes(s.id));
  }

  async medicoExiste(id: string) {
    return this.medicos.has(id);
  }

  async equipeExiste(id: string) {
    return this.equipes.has(id);
  }

  async frente(id: string) {
    return this.frentes.get(id) ?? null;
  }

  /** Ids que existem nos cadastros, por tipo; tipo ausente = qualquer id existe. */
  readonly existentes = new Map<TipoReferencia, Set<string>>();

  async faltando(referencias: Referencias) {
    return (Object.entries(referencias) as [TipoReferencia, readonly string[]][])
      .filter(([tipo, ids]) => {
        const ok = this.existentes.get(tipo);
        return ok ? ids.some((id) => !ok.has(id)) : false;
      })
      .map(([tipo]) => tipo);
  }

  async rotulos({ clienteIds, exameIds }: { clienteIds: string[]; exameIds: string[] }) {
    const com = (ids: string[]) => ids.map((id) => ({ id, nome: this.nomes.get(id) ?? id }));
    return { clientes: com(clienteIds), exames: com(exameIds) };
  }
}

export const arranjoVazio = (parcial: Partial<Arranjo> = {}): Arranjo => ({
  especialidadeId: null,
  modalidadeId: null,
  especialidadeIds: [],
  modalidadeIds: [],
  subespecialidadeIds: [],
  subespecialidadeGeral: false,
  prioridadeIds: [],
  modoClientes: 'todos',
  clienteIds: [],
  modoExames: 'todos',
  exameIds: [],
  clientesExclusivosIds: [],
  ...parcial,
});

export class ConfiguracaoEmMemoria implements ConfiguracaoDistribuicaoRepository {
  atual: ConfiguracaoGlobal | null = null;
  gravacoes = 0;

  async obter() {
    return this.atual && structuredClone(this.atual);
  }

  async salvar(configuracao: ConfiguracaoGlobal) {
    this.gravacoes++;
    this.atual = structuredClone(configuracao);
  }
}

const chave = (f: FrenteEscala) => f.especialidadeId ?? f.modalidadeId;

export class RegrasFrenteEmMemoria implements RegrasFrenteRepository {
  readonly porFrente = new Map<string, RegrasFrente>();
  gravacoes = 0;

  async obter(frente: FrenteEscala) {
    const r = this.porFrente.get(chave(frente));
    return r ? structuredClone(r) : null;
  }

  async listar() {
    return [...this.porFrente.values()].map((r) => structuredClone(r));
  }

  async salvar(regras: RegrasFrente) {
    this.gravacoes++;
    this.porFrente.set(chave(regras.frente), structuredClone(regras));
  }
}

export class PrioridadesClienteEmMemoria implements PrioridadesClienteRepository {
  readonly porCliente = new Map<string, PrioridadeDaFrente[]>();
  gravacoes = 0;

  async doCliente(clienteId: string) {
    return structuredClone(this.porCliente.get(clienteId) ?? []);
  }

  async substituir(clienteId: string, itens: PrioridadeDaFrente[]) {
    this.gravacoes++;
    this.porCliente.set(clienteId, structuredClone(itens));
  }

  async todas() {
    return [...this.porCliente].flatMap(([clienteId, itens]) =>
      itens.map((i) => ({ clienteId, ...structuredClone(i) })),
    );
  }
}

export class EscalaDoAjusteEmMemoria implements EscalaDoAjuste {
  readonly alocacoes = new Map<string, AlocacaoDoAjuste>();
  /** Dias de plantão por alocação. */
  readonly plantoes = new Map<string, Set<string>>();
  /** Recorte por usuário (frentes liberadas); sem entrada = sem recorte. */
  readonly recortes = new Map<string, Set<string>>();

  private noRecorte(ator: AtorEscala, alvo: { frenteId: string }) {
    const r = ator.acessoTotal ? undefined : this.recortes.get(ator.usuarioId);
    return !r || r.has(alvo.frenteId);
  }

  async alocacaoNoRecorte(ator: AtorEscala, alocacaoId: string) {
    const a = this.alocacoes.get(alocacaoId);
    return a && this.noRecorte(ator, a) ? { ...a } : null;
  }

  async diasDePlantao(alocacaoId: string, de: string, ate: string) {
    return [...(this.plantoes.get(alocacaoId) ?? [])].filter((d) => d >= de && d <= ate).sort();
  }

  async recorteDo(ator: AtorEscala) {
    return (alvo: { turnoId: string; frenteId: string }) => this.noRecorte(ator, alvo);
  }
}

export class AjustesDiaEmMemoria implements AjustesDiaRepository {
  readonly itens = new Map<string, AjusteDiaDistribuicao>();
  /** Ajustes gravados ou removidos, somando todas as chamadas. */
  gravacoes = 0;
  /** Chamadas de `aplicar` (cada uma é uma transação no repositório real). */
  aplicacoes = 0;
  readonly eventos: EventoAuditoria[] = [];

  constructor(
    private readonly escala: EscalaDoAjusteEmMemoria,
    private readonly nomes = new Map<string, string>(),
  ) {}

  private ler(a: AjusteDiaDistribuicao): AjusteDiaLido {
    const aloc = this.escala.alocacoes.get(a.alocacaoId) as AlocacaoDoAjuste;
    return {
      ...structuredClone(a),
      medicoId: aloc.medicoId,
      turnoId: aloc.turnoId,
      frenteId: aloc.frenteId,
      clienteNome: a.clienteId ? (this.nomes.get(a.clienteId) ?? null) : null,
    };
  }

  async obter(alocacaoId: string, data: string) {
    const a = this.itens.get(`${alocacaoId}|${data}`);
    return a ? this.ler(a) : null;
  }

  async aplicar(mudanca: MudancaAjustesDia, eventos: EventoAuditoria[]) {
    this.aplicacoes++;
    for (const ajuste of mudanca.gravar) {
      this.gravacoes++;
      this.itens.set(`${ajuste.alocacaoId}|${ajuste.data}`, structuredClone(ajuste));
    }
    for (const id of mudanca.removerIds) {
      this.gravacoes++;
      for (const [k, a] of this.itens) if (a.id === id) this.itens.delete(k);
    }
    this.eventos.push(...structuredClone(eventos));
  }

  async listar(f: FiltroAjustesDia) {
    return [...this.itens.values()]
      .filter((a) => a.data >= f.de && a.data <= f.ate)
      .filter((a) => !f.alocacaoId || a.alocacaoId === f.alocacaoId)
      .map((a) => this.ler(a))
      .filter((a) => !f.medicoId || a.medicoId === f.medicoId)
      .sort((a, b) => (a.data < b.data ? -1 : 1));
  }
}

export class PrioridadesOperacaoEmMemoria implements PrioridadesOperacaoRepository {
  readonly porId = new Map<string, PrioridadeOperacao>();
  grade: CelulaRecebimento[] = [];
  gravacoes = 0;
  private seq = 0;

  async listar() {
    return [...this.porId.values()]
      .sort((a, b) => a.posicao - b.posicao || a.nome.localeCompare(b.nome))
      .map((p) => structuredClone(p));
  }

  async criar(edicao: EdicaoPrioridadeOperacao) {
    const id = `op${++this.seq}`;
    await this.salvar({ id, ...edicao });
    return id;
  }

  async salvar(p: PrioridadeOperacao) {
    this.gravacoes++;
    if (p.padrao) for (const o of this.porId.values()) o.padrao = false;
    this.porId.set(p.id, structuredClone(p));
  }

  async excluir(id: string) {
    this.gravacoes++;
    this.porId.delete(id);
    this.grade = this.grade.filter((c) => c.prioridadeOperacaoId !== id);
  }

  async obterGrade() {
    return structuredClone(this.grade);
  }

  async salvarGrade(celulas: readonly CelulaRecebimento[]) {
    this.gravacoes++;
    this.grade = structuredClone([...celulas]);
  }
}

export class RetratoFilaEmMemoria implements RetratoFilaRepository {
  atual: RetratoFilaGravado = { fila: null, pedidaEm: null, falhouEm: null, erro: null };
  /** Leituras enfileiradas (o job único por chave fica a cargo da fila de verdade). */
  pedidos = 0;

  async obter() {
    return structuredClone(this.atual);
  }

  async gravar(fila: FilaDoMomento) {
    this.atual = { ...this.atual, fila: structuredClone(fila), falhouEm: null, erro: null };
  }

  async registrarFalha(em: Date, erro: string) {
    this.atual = { ...this.atual, falhouEm: em, erro };
  }

  async pedirLeitura(em: Date) {
    this.pedidos++;
    this.atual = { ...this.atual, pedidaEm: em };
  }
}

export class ExcecoesRecebimentoEmMemoria implements ExcecoesRecebimentoRepository {
  readonly itens = new Map<string, ExcecaoRecebimento>();
  private seq = 0;

  async listar() {
    return [...this.itens.values()].sort(
      (a, b) => b.de.localeCompare(a.de) || b.criadoEm.getTime() - a.criadoEm.getTime(),
    );
  }

  async terminandoDesde(dia: string) {
    return (await this.listar()).filter((e) => e.ate >= dia);
  }

  async obter(id: string) {
    return this.itens.get(id) ?? null;
  }

  async criar(e: Omit<ExcecaoRecebimento, 'id'>) {
    const id = `exc-${++this.seq}`;
    this.itens.set(id, { ...e, id });
    return id;
  }

  async salvar(e: ExcecaoRecebimentoGravavel) {
    const atual = this.itens.get(e.id);
    if (atual) this.itens.set(e.id, { ...e, criadoEm: atual.criadoEm });
  }

  async excluir(id: string) {
    this.itens.delete(id);
  }
}
