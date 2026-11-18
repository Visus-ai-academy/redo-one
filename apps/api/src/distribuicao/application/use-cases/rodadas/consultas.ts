import type { FrenteEscala } from '../../../domain/arranjo';
import type { Barreira } from '../../../domain/motor/medicos-disponiveis';
import { montarEntrada, RECORTES_VAZIOS } from '../../../domain/rodada/entrada';
import type { StatusRodada } from '../../../domain/rodada/maquina';
import type { InsumosGravados } from '../../../domain/rodada/proposta';
import type {
  AjustesConferencia,
  ContagemPorMotivo,
  DesignacaoDetalhada,
  FiltroDesignacoes,
  FiltroHistorico,
  Pagina,
  RodadaListada,
  RotuloRodada,
} from '../../ports/consulta-rodadas';
import type { ContagemDesignacoes, EventoRodada, Rodada } from '../../ports/rodadas.repository';
import { type AtorRodada, auditar, type DependenciasRodada, rodadaOuErro } from './comum';
import { DesignacaoNaoEncontradaError } from './erros';

/** Linhas do diário que a tela mostra. */
const EVENTOS_NO_DETALHE = 60;

export interface SituacaoRodada {
  id: string;
  status: StatusRodada;
  expiraEm: Date | null;
  erro: string | null;
  /** O último evento com barra (a execução); null fora dela. */
  progresso: EventoRodada | null;
  contagens: ContagemDesignacoes;
}

export interface RodadaDetalhe extends Rodada {
  solicitadaPor: RotuloRodada | null;
  aprovadaPor: RotuloRodada | null;
  contagens: ContagemDesignacoes;
  progresso: EventoRodada | null;
  eventos: EventoRodada[];
}

const progressoDe = (eventos: readonly EventoRodada[]) => {
  const ultimo = eventos.at(-1);
  return ultimo?.total != null ? ultimo : null;
};

/** O endpoint leve do polling (3–5 s, só com rodada ativa): status, progresso e contagens. */
export class ConsultarSituacao {
  constructor(private readonly d: DependenciasRodada) {}

  async executar(id: string): Promise<SituacaoRodada> {
    const r = await rodadaOuErro(this.d, id);
    const [contagens, eventos] = await Promise.all([
      this.d.rodadas.contar(id),
      this.d.rodadas.eventos(id, 1),
    ]);
    return {
      id,
      status: r.status,
      expiraEm: r.expiraEm,
      erro: r.erro,
      progresso: progressoDe(eventos),
      contagens,
    };
  }
}

export class ConsultarRodada {
  constructor(private readonly d: DependenciasRodada) {}

  async porId(id: string): Promise<RodadaDetalhe> {
    return this.detalhe(await rodadaOuErro(this.d, id));
  }

  /** A rodada viva com o resumo; null = nenhuma. */
  async viva(): Promise<RodadaDetalhe | null> {
    await this.d.rodadas.expirarVencidas(this.d.agora());
    const r = await this.d.rodadas.viva();
    return r ? this.detalhe(r) : null;
  }

  async historico(filtro: FiltroHistorico): Promise<Pagina<RodadaListada>> {
    await this.d.rodadas.expirarVencidas(this.d.agora());
    return this.d.consulta.historico(filtro);
  }

  private async detalhe(r: Rodada): Promise<RodadaDetalhe> {
    const usuarios = [r.solicitadaPorId, r.aprovadaPorId].filter((x): x is string => !!x);
    const [contagens, eventos, nomes] = await Promise.all([
      this.d.rodadas.contar(r.id),
      this.d.rodadas.eventos(r.id, EVENTOS_NO_DETALHE),
      this.d.consulta.nomesUsuarios(usuarios),
    ]);
    const rotulo = (id: string | null) => (id ? { id, nome: nomes.get(id) ?? '' } : null);
    return {
      ...r,
      solicitadaPor: rotulo(r.solicitadaPorId),
      aprovadaPor: rotulo(r.aprovadaPorId),
      contagens,
      progresso: progressoDe(eventos),
      eventos,
    };
  }
}

export interface DesignacaoComPaciente extends DesignacaoDetalhada {
  /** Lido na MobileMed agora, só com `distribuicao.paciente.ver`; null sem ela ou fora da fila. */
  nomePaciente: string | null; // LGPD: pessoal (nunca gravado)
}

/**
 * As designações da rodada, paginadas e filtradas. O nome do paciente só vem para quem tem a
 * permissão: é lido na porta da fila na hora (nunca do banco) e cada leitura é auditada.
 */
export class ListarDesignacoes {
  constructor(private readonly d: DependenciasRodada) {}

  async executar(
    ator: AtorRodada,
    rodadaId: string,
    filtro: FiltroDesignacoes,
    comPaciente: boolean,
  ): Promise<Pagina<DesignacaoComPaciente>> {
    await rodadaOuErro(this.d, rodadaId);
    const pagina = await this.d.consulta.designacoes(rodadaId, filtro);
    let nomes = new Map<string, string>();
    if (comPaciente && pagina.itens.length) {
      nomes = await this.d.fila.nomesPacientes(pagina.itens.map((i) => i.idExameMobilemed));
      await auditar(this.d, ator, rodadaId, 'paciente_lido', {
        exames: pagina.itens.length,
        idsExame: pagina.itens.map((i) => i.idExameMobilemed),
      });
    }
    return {
      total: pagina.total,
      itens: pagina.itens.map((i) => ({
        ...i,
        nomePaciente: comPaciente ? (nomes.get(i.idExameMobilemed) ?? null) : null,
      })),
    };
  }
}

export interface ContagemFila {
  exames: number;
  urgentes: number;
}

export interface FrenteDaFila extends ContagemFila {
  /** Frente da escala (`frentes_escala.id`); null = o exame não casa com nenhuma. */
  frenteId: string | null;
  nome: string;
  primeiroVencimento: Date | null;
  porPrioridade: ({ prioridadeOperacaoId: string | null } & ContagemFila)[];
}

export interface TurnoDaFila {
  turnoId: string;
  nome: string;
  inicio: Date;
  fim: Date;
  /** Médicos habilitados escalados (sem ausência). */
  medicos: number;
  /** Cor cadastrada do turno; null = sem cor. */
  cor: string | null;
  emAndamento: boolean;
}

export interface FilaDoMomento {
  lidaEm: Date;
  /** Exames NOVO sem médico. */
  total: number;
  urgentes: number;
  /** Prazo já passou. */
  vencidos: number;
  /** Prazo na próxima hora, sem os já vencidos. */
  vencemProximaHora: number;
  /** O prazo mais antigo da fila (o vencido mais antigo, se houver). */
  primeiroVencimento: Date | null;
  /** O próximo prazo a vencer (o primeiro ainda não vencido). */
  proximoVencimento: Date | null;
  /** Ativos e habilitados no robô. */
  habilitados: number;
  /** Desligado em Configurações › Distribuição, ninguém inicia rodada. */
  roboAtivo: boolean;
  /** As prioridades da operação, na ordem (as colunas da tabela por frente). */
  prioridades: ({
    prioridadeOperacaoId: string | null;
    nome: string;
    /** A cor cadastrada; null = neutra. */
    cor: string | null;
  } & ContagemFila)[];
  porFrente: FrenteDaFila[];
  /** Turnos de hoje que ainda não acabaram. */
  turnos: TurnoDaFila[];
  semCatalogo: number;
  semCliente: number;
  porPrioridade: ({ prioridadeOperacaoId: string | null; nome: string } & ContagemFila)[];
  porEspecialidade: ({ especialidadeId: string | null; nome: string } & ContagemFila)[];
  porModalidade: ({ modalidadeId: string | null; nome: string } & ContagemFila)[];
  medicosEmTurno: {
    medicoId: string;
    nome: string;
    alocacaoId: string;
    turnoId: string;
    frente: FrenteEscala;
    inicio: Date;
    fim: Date;
    produtividade: number | null;
    cargaEmMaos: number;
    turno: string;
    frenteNome: string;
    /** A frente da escala (`frentes_escala.id`); null = sem cadastro. */
    frenteId: string | null;
    turnoCor: string | null;
    frenteCor: string | null;
    /**
     * Os segmentos que a alocação cobre: sem recorte, todos os da especialidade da frente; com
     * recorte, só os recortados. Frente de modalidade não tem segmento.
     */
    segmentos: SegmentoEmTurno[];
    /** A alocação tem recorte de segmento (a tela o mostra junto da frente). */
    segmentosRecortados: boolean;
  }[];
}

export interface SegmentoEmTurno {
  id: string;
  nome: string;
  cor: string | null;
}

const HORA = 3_600_000;
const menor = (a: Date | null, b: Date | null) => (a && b ? (a < b ? a : b) : (a ?? b));

/**
 * A fila agora, para a tela antes de distribuir: contagens por prioridade da operação e frente e
 * quem está em turno. Lê a porta da fila e as tabelas, sem gravar nada.
 */
export class ConsultarFilaDoMomento {
  constructor(private readonly d: DependenciasRodada) {}

  async executar(): Promise<FilaDoMomento> {
    const agora = this.d.agora();
    const [leitura, { insumos, catalogo }] = await Promise.all([
      this.d.fila.ler(),
      this.d.insumos.carregar(agora),
    ]);
    const { entrada, lidos, semCatalogo, semCliente } = montarEntrada({
      agora,
      leitura,
      catalogo,
      insumos,
      entregas: { porExame: new Map(), cotaEntregue: {} },
      recortes: RECORTES_VAZIOS,
      pseudonimo: (t) => this.d.pseudonimizador.pseudonimo(t),
    });
    const novos = new Set(entrada.exames.filter((e) => e.novo).map((e) => e.id));
    const fila = lidos.filter((l) => novos.has(l.idExame));
    const nome = (id: string | null, semNome: string) => (id ? (insumos.nomes[id] ?? id) : semNome);
    const contar = (chave: (l: (typeof fila)[number]) => string | null) => {
      const mapa = new Map<string | null, ContagemFila>();
      for (const l of fila) {
        const k = chave(l);
        const c = mapa.get(k) ?? { exames: 0, urgentes: 0 };
        c.exames++;
        if (l.urgente) c.urgentes++;
        mapa.set(k, c);
      }
      return [...mapa].map(([id, c]) => ({ id, ...c }));
    };
    const carga = new Map(entrada.medicos.map((m) => [m.id, m.cargaEmMaos]));
    const cor = (id: string | null) => (id ? (insumos.cores?.[id] ?? null) : null);
    const segmento = (id: string): SegmentoEmTurno => ({ id, nome: nome(id, ''), cor: cor(id) });
    const frenteIdDe = (f: FrenteEscala) =>
      Object.entries(insumos.frentes).find(
        ([, x]) =>
          x.tipo === f.tipo &&
          x.especialidadeId === f.especialidadeId &&
          x.modalidadeId === f.modalidadeId,
      )?.[0] ?? null;
    // Recorte de segmento: vazio sem o geral = todos; com ele, só os recortados (o geral é o exame
    // sem segmento, que não casa com nenhum filtro de segmento).
    const segmentosDe = (o: (typeof insumos.ocorrencias)[number]) => {
      const recortado = o.subespecialidadeIds.length > 0 || o.subespecialidadeGeral;
      if (o.frente.tipo !== 'especialidade' || !o.frente.especialidadeId) {
        return { segmentos: [], recortado };
      }
      const ids = recortado
        ? o.subespecialidadeIds
        : (insumos.segmentos?.[o.frente.especialidadeId] ?? []);
      return { segmentos: ids.map(segmento), recortado };
    };
    const nomeMedico = new Map(insumos.medicos.map((m) => [m.id, m.nome]));

    // --- por frente da escala × prioridade da operação ---
    const frentes = Object.entries(insumos.frentes);
    const frenteDo = (l: (typeof fila)[number]) =>
      (frentes.find(([, f]) => f.especialidadeId && f.especialidadeId === l.especialidadeId) ??
        frentes.find(([, f]) => f.modalidadeId && f.modalidadeId === l.modalidadeId))?.[0] ?? null;
    const porFrente = new Map<string | null, FrenteDaFila>();
    for (const l of fila) {
      const id = frenteDo(l);
      const f = insumos.frentes[id ?? ''];
      const linha = porFrente.get(id) ?? {
        frenteId: id,
        nome: f ? nome(f.especialidadeId ?? f.modalidadeId, '') : 'Sem frente',
        exames: 0,
        urgentes: 0,
        primeiroVencimento: null,
        porPrioridade: [],
      };
      linha.exames++;
      if (l.urgente) linha.urgentes++;
      linha.primeiroVencimento = menor(linha.primeiroVencimento, l.prazo);
      let p = linha.porPrioridade.find((x) => x.prioridadeOperacaoId === l.prioridadeOperacaoId);
      if (!p) {
        p = { prioridadeOperacaoId: l.prioridadeOperacaoId, exames: 0, urgentes: 0 };
        linha.porPrioridade.push(p);
      }
      p.exames++;
      if (l.urgente) p.urgentes++;
      porFrente.set(id, linha);
    }
    const contagemPrioridade = contar((l) => l.prioridadeOperacaoId);
    const daPrioridade = (id: string | null) =>
      contagemPrioridade.find((c) => c.id === id) ?? { exames: 0, urgentes: 0 };
    const prioridades = [...insumos.prioridadesOperacao]
      .sort((a, b) => a.posicao - b.posicao)
      .map((p) => ({
        prioridadeOperacaoId: p.id as string | null,
        nome: p.nome,
        cor: p.cor,
        ...daPrioridade(p.id),
      }));
    if (contagemPrioridade.some((c) => c.id === null)) {
      prioridades.push({
        prioridadeOperacaoId: null,
        nome: 'Sem prioridade',
        cor: null,
        ...daPrioridade(null),
      });
    }

    // --- turnos de hoje que ainda não acabaram ---
    const turnos = new Map<string, TurnoDaFila & { ids: Set<string> }>();
    for (const o of insumos.ocorrencias) {
      if (o.ausente || !nomeMedico.has(o.medicoId) || o.fim <= agora) continue;
      if (o.inicio.getTime() > agora.getTime() + 24 * HORA) continue;
      const t = turnos.get(o.turnoId) ?? {
        turnoId: o.turnoId,
        nome: nome(o.turnoId, ''),
        inicio: o.inicio,
        fim: o.fim,
        cor: cor(o.turnoId),
        medicos: 0,
        emAndamento: false,
        ids: new Set<string>(),
      };
      t.ids.add(o.medicoId);
      t.medicos = t.ids.size;
      if (o.inicio < t.inicio) t.inicio = o.inicio;
      if (o.fim > t.fim) t.fim = o.fim;
      if (o.inicio <= agora && agora < o.fim) t.emAndamento = true;
      turnos.set(o.turnoId, t);
    }

    const limite = agora.getTime() + HORA;
    const prazos = fila.flatMap((l) => (l.prazo ? [l.prazo.getTime()] : []));
    const aVencer = prazos.filter((t) => t >= agora.getTime());
    return {
      lidaEm: agora,
      total: fila.length,
      urgentes: fila.filter((l) => l.urgente).length,
      vencidos: prazos.length - aVencer.length,
      vencemProximaHora: aVencer.filter((t) => t <= limite).length,
      primeiroVencimento: prazos.length ? new Date(Math.min(...prazos)) : null,
      proximoVencimento: aVencer.length ? new Date(Math.min(...aVencer)) : null,
      habilitados: insumos.medicos.length,
      roboAtivo: insumos.config.roboAtivo,
      prioridades,
      porFrente: [...porFrente.values()].sort(
        (a, b) => Number(a.frenteId === null) - Number(b.frenteId === null) || b.exames - a.exames,
      ),
      turnos: [...turnos.values()]
        .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
        .map(({ ids: _, ...t }) => t),
      semCatalogo,
      semCliente,
      porPrioridade: contar((l) => l.prioridadeOperacaoId).map(({ id, ...c }) => ({
        prioridadeOperacaoId: id,
        nome: nome(id, 'Sem prioridade'),
        ...c,
      })),
      porEspecialidade: contar((l) => l.especialidadeId).map(({ id, ...c }) => ({
        especialidadeId: id,
        nome: nome(id, 'Sem especialidade'),
        ...c,
      })),
      porModalidade: contar((l) => l.modalidadeId).map(({ id, ...c }) => ({
        modalidadeId: id,
        nome: nome(id, 'Sem modalidade'),
        ...c,
      })),
      medicosEmTurno: insumos.ocorrencias
        .filter(
          (o) => !o.ausente && nomeMedico.has(o.medicoId) && o.inicio <= agora && agora < o.fim,
        )
        .map((o) => {
          const { segmentos, recortado } = segmentosDe(o);
          return {
            medicoId: o.medicoId,
            nome: nomeMedico.get(o.medicoId) ?? '',
            alocacaoId: o.alocacaoId,
            turnoId: o.turnoId,
            frente: o.frente,
            inicio: o.inicio,
            fim: o.fim,
            produtividade: o.produtividade,
            cargaEmMaos: carga.get(o.medicoId) ?? 0,
            turno: nome(o.turnoId, ''),
            frenteNome: nome(o.frente.especialidadeId ?? o.frente.modalidadeId, ''),
            frenteId: frenteIdDe(o.frente),
            turnoCor: cor(o.turnoId),
            frenteCor: cor(o.frente.especialidadeId ?? o.frente.modalidadeId),
            segmentos,
            segmentosRecortados: recortado,
          };
        }),
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Resumo da proposta e o "por que este médico não pegou" (passo 5), dos insumos gravados
// ---------------------------------------------------------------------------------------------

export interface MedicoDoResumo {
  medicoId: string;
  nome: string;
  turnos: string[];
  frentes: string[];
  /** Teto da escala comum na leitura; null = sem teto conhecido. */
  capacidade: number | null;
  /** Carga em mãos na leitura (já aberta na MobileMed). */
  cargaEmMaos: number;
  propostos: number;
  urgencias: number;
  pacotes: number;
  previstas: number;
  executadas: number;
  puladas: number;
  falharam: number;
  naMao: number;
}

export interface ResumoRodada {
  medicos: MedicoDoResumo[];
  motivos: ContagemPorMotivo[];
  ajustes: AjustesConferencia;
  funilExames: InsumosGravados['funil']['exames'] | null;
  funilMedicos: {
    habilitados: number;
    escalados: number;
    disponiveis: number;
    noTurno: number;
    noHorario: number;
    /** Dos no horário, os com conta na MobileMed. */
    comConta: number;
    tirados: number;
    receberam: number;
  } | null;
  trilha: { pacotes: number; examesAgrupados: number; aderencia: number } | null;
}

const ZERO = {
  propostos: 0,
  urgencias: 0,
  pacotes: 0,
  previstas: 0,
  executadas: 0,
  puladas: 0,
  falharam: 0,
  naMao: 0,
};

/** A tabela por médico, os motivos de quem ficou de fora, os ajustes e o funil da rodada. */
export class ConsultarResumo {
  constructor(private readonly d: DependenciasRodada) {}

  async executar(id: string): Promise<ResumoRodada> {
    const r = await rodadaOuErro(this.d, id);
    const [insumos, contagens, motivos, ajustes] = await Promise.all([
      this.d.rodadas.insumos(id),
      this.d.consulta.porMedico(id),
      this.d.consulta.porMotivo(id),
      this.d.consulta.ajustes(id),
    ]);
    const retrato = insumos?.medicos ?? [];
    const porId = new Map(contagens.map((c) => [c.medicoId, c]));
    const medicos: MedicoDoResumo[] = retrato.map((m) => {
      const {
        medicoId: _,
        nome: __,
        ...c
      } = porId.get(m.id) ?? { medicoId: m.id, nome: m.nome, ...ZERO };
      return {
        medicoId: m.id,
        nome: m.nome,
        turnos: m.turnos,
        frentes: m.frentes,
        capacidade: m.capacidade,
        cargaEmMaos: m.cargaEmMaos,
        ...c,
      };
    });
    const noRetrato = new Set(retrato.map((m) => m.id));
    for (const c of contagens) {
      if (noRetrato.has(c.medicoId)) continue;
      // Mandado na conferência a quem não estava na rodada.
      medicos.push({ ...c, turnos: [], frentes: [], capacidade: null, cargaEmMaos: 0 });
    }
    medicos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return {
      medicos,
      motivos,
      ajustes,
      funilExames: insumos?.funil.exames ?? null,
      funilMedicos: insumos
        ? {
            habilitados: insumos.habilitados.length,
            ...insumos.funil.medicos,
            // Leituras gravadas antes do portão da conta não o têm: todos seguiram.
            comConta: insumos.funil.medicos.comConta ?? insumos.funil.medicos.noHorario,
            tirados: r.recortes.medicosExcluidos.length,
            receberam: contagens.filter((c) => c.propostos > 0).length,
          }
        : null,
      trilha: insumos
        ? {
            pacotes: insumos.trilha.pacotes,
            examesAgrupados: insumos.trilha.examesAgrupados,
            aderencia: insumos.trilha.aderencia,
          }
        : null,
    };
  }
}

export interface CheckExplicacao {
  ok: boolean;
  titulo: string;
  detalhe: string;
}

export interface Explicacao {
  medico: RotuloRodada;
  /** O médico ficou com o exame (proposto ou atribuído). */
  pegou: boolean;
  /** A frase do desfecho ("Não pegou porque..."). */
  titulo: string;
  /** Os portões, na ordem, até o primeiro que barrou. */
  checks: CheckExplicacao[];
}

/** Recusas que acontecem antes de olhar os médicos (o exame nem entrou na distribuição). */
const ANTES_DOS_MEDICOS = new Set([
  'nao_novo',
  'fora_da_prioridade',
  'fora_da_clinica',
  'fora_da_frente',
  'horario_sem_robo',
  'frente_manual',
]);

const PORTOES: {
  barreira: Barreira[];
  titulo: string;
  ok: string;
  falha: string;
  frase: string;
}[] = [
  {
    barreira: ['sem_conta_mobilemed'],
    titulo: 'Tem conta na MobileMed',
    ok: 'O id dele na MobileMed está cadastrado',
    falha: 'Sem id da MobileMed no cadastro do médico: o robô não tem como atribuir a ele',
    frase: 'não tem conta na MobileMed cadastrada',
  },
  {
    barreira: ['escala'],
    titulo: 'O turno recebe o exame',
    ok: 'Algum período dele aceita a frente, a prioridade e o segmento agora',
    falha:
      'Nenhum período dele aceita este exame agora (frente, prioridade, segmento, grade de recebimento ou horário sem robô)',
    frase: 'o turno dele não recebe este exame agora',
  },
  {
    barreira: ['arranjo'],
    titulo: 'Lauda o exame',
    ok: 'Um arranjo dele casa com o exame',
    falha:
      'Nenhum arranjo dele casa com o exame (especialidade, modalidade, prioridade, cliente ou exame)',
    frase: 'não lauda este exame pelo arranjo',
  },
  {
    barreira: ['equipe'],
    titulo: 'Da equipe do exame',
    ok: 'O exame não é direcionado a outra equipe',
    falha: 'O exame é direcionado a uma equipe da qual ele não faz parte',
    frase: 'o exame é de outra equipe',
  },
  {
    barreira: ['reservado'],
    titulo: 'A clínica não é exclusiva de outro médico',
    ok: 'Sem exclusividade de outro médico para este exame',
    falha: 'A clínica é exclusiva de outro(s) médico(s) neste recorte',
    frase: 'a clínica é exclusiva de outro médico',
  },
  {
    barreira: ['ja_entregue', 'retirado_na_conferencia'],
    titulo: 'Não tinha sido tirado deste exame',
    ok: 'O robô nunca devolve o exame a quem já o recebeu ou de quem a operação o tirou',
    falha: '',
    frase: '',
  },
];

const FALHA_ENTREGA: Record<
  'ja_entregue' | 'retirado_na_conferencia',
  { detalhe: string; frase: string }
> = {
  ja_entregue: {
    detalhe: 'O robô já o entregou a ele e o exame voltou à fila: não volta para ele',
    frase: 'já tinha recebido este exame do robô',
  },
  retirado_na_conferencia: {
    detalhe: 'Retirado deste médico na conferência de uma rodada: o robô não o devolve a ele',
    frase: 'o exame foi retirado deste médico na conferência',
  },
};

/**
 * "Por que este médico não pegou este exame?", lido do registro da rodada: os portões que o médico
 * passou e o primeiro que o barrou, como estavam na leitura.
 */
export class ExplicarDesignacao {
  constructor(private readonly d: DependenciasRodada) {}

  async executar(rodadaId: string, designacaoId: string, medicoId: string): Promise<Explicacao> {
    const r = await rodadaOuErro(this.d, rodadaId);
    const [d, insumos] = await Promise.all([
      this.d.consulta.designacaoExplicada(rodadaId, designacaoId),
      this.d.rodadas.insumos(rodadaId),
    ]);
    if (!d) throw new DesignacaoNaoEncontradaError();
    const retrato = insumos?.medicos.find((m) => m.id === medicoId);
    const nome =
      retrato?.nome ?? (await this.d.consulta.nomesMedicos([medicoId])).get(medicoId) ?? '';
    const checks: CheckExplicacao[] = [];
    const fim = (pegou: boolean, titulo: string): Explicacao => ({
      medico: { id: medicoId, nome },
      pegou,
      titulo,
      checks,
    });
    const passo = (ok: boolean, titulo: string, detalhe: string) =>
      checks.push({ ok, titulo, detalhe });

    const habilitado = insumos?.habilitados.includes(medicoId) ?? false;
    passo(
      habilitado,
      'Habilitado no robô',
      habilitado
        ? 'Ativo e habilitado na aba Distribuição do médico'
        : 'Não estava ativo e habilitado no robô na hora da leitura',
    );
    if (!habilitado) return fim(false, 'Não pegou porque não estava habilitado no robô.');

    const tirado = r.recortes.medicosExcluidos.includes(medicoId);
    passo(
      !tirado,
      'Na rodada',
      tirado ? 'Foi tirado desta rodada ao pedir a distribuição' : 'Não foi tirado desta rodada',
    );
    if (tirado) return fim(false, 'Não pegou porque foi tirado desta rodada.');

    passo(
      !!retrato,
      'Em turno na rodada',
      retrato
        ? `${retrato.turnos.join(' e ')}${retrato.frentes.length ? `: ${retrato.frentes.join(', ')}` : ''}`
        : 'Sem período em andamento nos turnos e frentes da rodada (ou com ausência no dia)',
    );
    if (!retrato) return fim(false, 'Não pegou porque não estava em turno na rodada.');

    const barreira = d.barrados[medicoId];
    const elegivel = d.elegiveis.includes(medicoId);
    if (!barreira && !elegivel) {
      passo(
        false,
        'O exame entrou na distribuição',
        d.detalhe ?? 'O exame não chegou aos médicos.',
      );
      return fim(
        false,
        d.motivo && ANTES_DOS_MEDICOS.has(d.motivo)
          ? 'Não pegou porque o exame ficou de fora antes de olhar os médicos.'
          : 'Não pegou: o exame não chegou a ele nesta leitura.',
      );
    }
    for (const p of PORTOES) {
      const barrou = barreira && p.barreira.includes(barreira);
      if (!barrou) {
        passo(true, p.titulo, p.ok);
        continue;
      }
      const entrega = barreira === 'ja_entregue' || barreira === 'retirado_na_conferencia';
      const falha = entrega ? FALHA_ENTREGA[barreira] : { detalhe: p.falha, frase: p.frase };
      passo(false, p.titulo, falha.detalhe);
      return fim(false, `Não pegou porque ${falha.frase}.`);
    }

    // Elegível: o desfecho veio da distribuição (teto, ordem) ou da conferência.
    const ficou = d.medico?.id === medicoId;
    if (ficou) {
      passo(
        true,
        d.status === 'executada' ? 'Recebeu o exame' : 'Ficou com o exame na proposta',
        d.naMao
          ? 'Mandado na mão na conferência'
          : d.medicoProposto?.id === medicoId
            ? 'Escolhido pelo robô'
            : 'Movido para ele na conferência',
      );
      return fim(
        true,
        d.status === 'executada' ? 'Pegou este exame.' : 'Este exame está com ele na proposta.',
      );
    }
    if (d.medicoProposto?.id === medicoId) {
      passo(
        false,
        'Ficou com ele na proposta',
        d.retiradoDe
          ? 'Tirado da proposta na conferência'
          : `Movido para ${d.medico?.nome ?? 'outro médico'} na conferência`,
      );
      return fim(false, 'O robô propôs a ele, mas a conferência mudou.');
    }
    if (d.status === 'recusada' && (d.motivo === 'sem_espaco' || d.motivo === 'teto_do_segmento')) {
      const teto =
        retrato.capacidade === null ? 'sem teto conhecido' : `teto de ${retrato.capacidade}`;
      passo(
        false,
        d.motivo === 'sem_espaco'
          ? 'Tinha espaço no teto do turno'
          : 'Tinha espaço no teto do segmento',
        `Já tinha ${retrato.cargaEmMaos} em mãos (${teto}) e os exames que vieram antes na fila o encheram`,
      );
      return fim(false, 'Não pegou porque estava no teto quando o exame chegou na vez dele.');
    }
    if (d.motivo === 'teto_da_rodada') {
      passo(false, 'Dentro do teto de exames da rodada', d.detalhe ?? '');
      return fim(false, 'Não pegou porque a rodada chegou ao teto de exames.');
    }
    passo(
      false,
      'Foi o escolhido entre os elegíveis',
      d.medicoProposto
        ? `O robô escolheu ${d.medicoProposto.nome} (menos carga ou o pacote do paciente já com ele)`
        : (d.detalhe ?? 'O exame ficou de fora'),
    );
    return fim(false, 'Não pegou: o exame foi para outro médico que também podia laudar.');
  }
}

/** Médicos para mover, mandar na mão ou incluir na rodada: ativos e com conta na MobileMed. */
export class BuscarMedicosDaRodada {
  constructor(private readonly d: DependenciasRodada) {}

  executar(termo: string) {
    return this.d.medicos.buscar(termo.trim(), 20);
  }
}
