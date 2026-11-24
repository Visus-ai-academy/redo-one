import { textoDoPaciente } from '../../../ingestao/domain/preparar-laudo';
import type { Arranjo, FrenteEscala } from '../arranjo';
import type { ConfiguracaoGlobal } from '../configuracao-global';
import { pesoNoTeto, type UnidadeTeto } from '../motor/capacidade';
import {
  type ConfiguracaoDistribuicao,
  type RegrasFrente,
  RegrasPorFrente,
} from '../motor/configuracao';
import { type DirecaoEquipe, type ReservaMedico, reservadoPara } from '../motor/elegibilidade';
import type { PrioridadeCliente } from '../motor/fila';
import type {
  AjusteDia,
  EntregaAnterior,
  MedicoRodada,
  OcorrenciaRodada,
} from '../motor/medicos-disponiveis';
import {
  type CelulaRecebimento,
  criarLeitorPrioridade,
  normalizarGrafia,
  type PrioridadeOperacao,
  urgenciaNaFrente,
  urgente,
} from '../motor/prioridades-operacao';
import type { EntradaRodada, FiltroRodada } from '../motor/rodada';
import type { EscalaDoMedico } from './proposta';

/**
 * Ponte entre a leitura da fila da MobileMed (texto cru) e o motor (ids do cadastro). Fonte:
 * dashboards-one `montarEntrada.ts` e `registrarPrevia` (`rodadas.ts`), sem banco: o catálogo, os
 * cadastros, a escala do instante e o histórico das designações entram prontos. O paciente vira
 * HMAC aqui e o nome não segue adiante.
 */

/** Só o exame NOVO na MobileMed é distribuído (regra do dashboards-one, `STATUS_A_DISTRIBUIR`). */
const STATUS_NOVO = 'NOVO';

export interface PacienteDaLeitura {
  codigo: string | null;
  nome: string;
}

/** Um exame da fila sem médico, como a porta `FilaExames` o entrega. */
export interface ExameDaLeitura {
  idExame: string;
  prioridade: string | null;
  estudo: string;
  unidade: string;
  /** Id da unidade na MobileMed cuja lista de médicos vale na atribuição; null = desconhecida. */
  unidadeMobilemed?: number | null;
  modalidade: string | null;
  especialidade: string | null;
  laudos: number | null;
  realizadoEm: Date;
  entradaEm: Date;
  prazo: Date | null;
  status: string;
  paciente: PacienteDaLeitura;
}

/** Exame já com médico e não laudado (carga em mãos, aderência e recolhimento). */
export interface ExameEmMaosDaLeitura {
  idExame: string;
  medicoIdMobilemed: number;
  status: string;
  prioridade: string | null;
  realizadoEm: Date;
  entradaEm: Date;
  prazo: Date | null;
  estudo: string;
  unidade: string;
  unidadeMobilemed?: number | null;
  modalidade: string | null;
  especialidade: string | null;
  laudos: number | null;
  paciente: PacienteDaLeitura;
}

export interface Leitura {
  semMedico: readonly ExameDaLeitura[];
  emMaos: readonly ExameEmMaosDaLeitura[];
}

export interface ClassificacaoEstudo {
  exameId: string | null;
  especialidadeId: string | null;
  modalidadeId: string | null;
  subespecialidadeId: string | null;
  especialidadesDoSegmento: string[];
}

/** O catálogo do redo-one para casar o texto da MobileMed (as mesmas regras da ingestão). */
export interface CatalogoDaFila {
  classificar(e: {
    estudo: string;
    modalidade: string | null;
    especialidade: string | null;
  }): ClassificacaoEstudo;
  /** Unidade da MobileMed → cliente (o principal, se for unidade de outro); null = sem cadastro. */
  cliente(unidade: string): string | null;
  /**
   * Unidade da MobileMed → o cadastro que casou, sem subir ao principal (a unidade de um cliente
   * unificado); null = sem cadastro. O arranjo que cita a unidade vale só para ela.
   */
  unidade(unidade: string): string | null;
  /** Grafia da MobileMed → prioridade do catálogo, pelas variações. */
  traduzirPrioridade(grafia: string): string | null;
}

export interface MedicoDaRodada {
  id: string;
  nome: string;
  /** Conta principal na MobileMed; sem ela, o médico não recebe (não há como atribuir). */
  idMobilemed: number | null;
  /**
   * As outras contas dele na MobileMed (o login do dia): o exame em mãos em qualquer uma conta na
   * carga e na aderência dele; a atribuição vai sempre para a principal.
   */
  outrasContas?: readonly number[];
  arranjos: Arranjo[];
  /** Em que o teto dele é contado (parâmetro do médico na distribuição). */
  unidadeTeto: UnidadeTeto;
}

/** O que a rodada lê das tabelas e da escala no instante da leitura. */
export interface InsumosRodada {
  config: ConfiguracaoGlobal;
  /** Ativos e habilitados no robô. */
  medicos: MedicoDaRodada[];
  equipes: DirecaoEquipe[];
  /** As ocorrências da escala em torno do instante (o motor escolhe as vigentes). */
  ocorrencias: OcorrenciaRodada[];
  /** Frente da escala (`frentes_escala.id`) → especialidade ou modalidade do catálogo. */
  frentes: Readonly<Record<string, FrenteEscala>>;
  ajustes: AjusteDia[];
  regrasFrente: RegrasFrente[];
  prioridadesOperacao: PrioridadeOperacao[];
  gradeRecebimento: CelulaRecebimento[];
  prioridadesCliente: PrioridadeCliente[];
  /** Id → nome, só para os textos (prioridades, clientes, frentes, segmentos). */
  nomes: Readonly<Record<string, string>>;
  /** Id → cor cadastrada (turnos, especialidades, modalidades, segmentos), só para a tela. */
  cores?: Readonly<Record<string, string | null>>;
  /** Especialidade → os segmentos (subespecialidades) dela, só para a tela. */
  segmentos?: Readonly<Record<string, readonly string[]>>;
}

/** O que as rodadas anteriores já entregaram. */
export interface Entregas {
  /**
   * Exame (id na MobileMed) → a quem o robô o entregou, ou de quem a conferência o tirou, nos
   * últimos `diasJaEntregue` dias.
   */
  porExame: ReadonlyMap<string, readonly EntregaAnterior[]>;
  /**
   * Alocação gratificada → o já executado por ela, em exames e em laudos: a cota abate na unidade
   * do teto do médico da alocação.
   */
  cotaEntregue: Readonly<Record<string, { exames: number; laudos: number }>>;
}

export interface RecortesRodada {
  turnoIds: string[];
  /** Frentes da escala (`frentes_escala.id`). */
  frenteIds: string[];
  prioridadeOperacaoIds: string[];
  /** Segmentos do catálogo; com `subespecialidadeGeral`, o exame sem segmento também passa. */
  subespecialidadeIds: string[];
  subespecialidadeGeral: boolean;
  clienteIds: string[];
  medicosExcluidos: string[];
  medicosIncluidos: string[];
}

export const RECORTES_VAZIOS: RecortesRodada = {
  turnoIds: [],
  frenteIds: [],
  prioridadeOperacaoIds: [],
  subespecialidadeIds: [],
  subespecialidadeGeral: false,
  clienteIds: [],
  medicosExcluidos: [],
  medicosIncluidos: [],
};

/** O exame como a rodada o grava (sem o nome do paciente). */
export interface ExameLido extends ClassificacaoEstudo {
  idExame: string;
  pacienteChave: string;
  estudo: string;
  unidade: string;
  laudos: number;
  realizadoEm: Date;
  entradaEm: Date;
  prazo: Date | null;
  prioridadeGrafia: string | null;
  prioridadeId: string | null;
  prioridadeOperacaoId: string | null;
  /** Posição da prioridade da operação; null = sem prioridade da operação. */
  posicao: number | null;
  urgente: boolean;
  clienteId: string | null;
  /** A unidade de onde o exame veio, quando é unidade de um principal; senão, null. */
  unidadeId?: string | null;
}

export interface EntradaMontada {
  entrada: EntradaRodada;
  lidos: ExameLido[];
  semCatalogo: number;
  semCliente: number;
}

/** O dia (AAAA-MM-DD) em Brasília. */
const diaEmBrasilia = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * Os turnos de cada médico no dia da leitura (nomes, sem repetir), para a tela mostrar a que turno
 * ele pertence: em andamento em `turnos`; os que ainda vão começar hoje (em Brasília) em
 * `aComecar`, com o início. As frentes juntam os dois. Encerrado e ausente ficam de fora. Só
 * descreve a escala: quem entra na rodada continua sendo decisão do motor.
 */
export function escalaDosMedicos(
  insumos: Pick<InsumosRodada, 'ocorrencias' | 'nomes'>,
  agora: Date,
): Record<string, EscalaDoMedico> {
  const nome = (id: string) => insumos.nomes[id] ?? id;
  const hoje = diaEmBrasilia(agora);
  const r: Record<string, EscalaDoMedico> = {};
  for (const o of insumos.ocorrencias) {
    if (o.ausente || agora >= o.fim) continue;
    const emAndamento = o.inicio <= agora;
    if (!emAndamento && diaEmBrasilia(o.inicio) !== hoje) continue;
    const m = r[o.medicoId] ?? { turnos: [], frentes: [], aComecar: [] };
    r[o.medicoId] = m;
    const turno = nome(o.turnoId);
    const frente = nome(o.frente.especialidadeId ?? o.frente.modalidadeId);
    if (emAndamento) {
      if (!m.turnos.includes(turno)) m.turnos.push(turno);
    } else if (!m.aComecar?.some((x) => x.turno === turno)) {
      m.aComecar?.push({ turno, inicio: o.inicio.toISOString() });
    }
    if (!m.frentes.includes(frente)) m.frentes.push(frente);
  }
  for (const m of Object.values(r)) {
    // O turno já em andamento por outra ocorrência não aparece de novo como "a começar".
    m.aComecar = (m.aComecar ?? [])
      .filter((x) => !m.turnos.includes(x.turno))
      .sort((x, y) => x.inicio.localeCompare(y.inicio));
  }
  return r;
}

export function configuracaoDoMotor(c: ConfiguracaoGlobal): ConfiguracaoDistribuicao {
  const {
    roboAtivo: _,
    expiracaoPropostaMin: __,
    tetoPorRodada: ___,
    recolhimentoAposTurnoMin: ____,
    recolhimentoAposListaMin: _____,
    ...motor
  } = c;
  return motor;
}

/** O já entregue de cada cota gratificada, na unidade do teto do médico da alocação. */
function cotaNaUnidade(
  entregue: Entregas['cotaEntregue'],
  insumos: Pick<InsumosRodada, 'medicos' | 'ocorrencias'>,
): Record<string, number> {
  const unidade = new Map(insumos.medicos.map((m) => [m.id, m.unidadeTeto]));
  const medicoDa = new Map(insumos.ocorrencias.map((o) => [o.alocacaoId, o.medicoId]));
  return Object.fromEntries(
    Object.entries(entregue).map(([alocacaoId, { exames, laudos }]) => {
      const medicoId = medicoDa.get(alocacaoId);
      const u = (medicoId && unidade.get(medicoId)) || 'exames';
      return [alocacaoId, u === 'laudos' ? laudos : exames];
    }),
  );
}

/** A unidade só quando é diferente do principal (o próprio principal não é unidade). */
function unidadeDo(catalogo: CatalogoDaFila, nomeMobileMed: string, clienteId: string | null) {
  const unidade = catalogo.unidade(nomeMobileMed);
  return unidade !== null && unidade !== clienteId ? unidade : null;
}

export function montarEntrada(p: {
  agora: Date;
  leitura: Leitura;
  catalogo: CatalogoDaFila;
  insumos: InsumosRodada;
  entregas: Entregas;
  recortes: RecortesRodada;
  /**
   * HMAC do texto do paciente (`codigo:…` ou `nome:…`), o mesmo da ingestão: o pseudônimo da
   * designação casa com o do laudo.
   */
  pseudonimo: (texto: string) => string;
  /**
   * Unidade (id na MobileMed) → contas liberadas nela: o médico cuja conta principal não está na
   * lista da unidade do exame fica de fora dele. Unidade fora do mapa = sem conferência.
   */
  contasPorUnidade?: ReadonlyMap<number, ReadonlySet<number>>;
}): EntradaMontada {
  const { agora, catalogo, insumos, recortes } = p;
  const chavePaciente = (pac: PacienteDaLeitura) =>
    p.pseudonimo(textoDoPaciente({ codigoPaciente: pac.codigo, nomePaciente: pac.nome }));
  const regras = new RegrasPorFrente(insumos.regrasFrente);
  const lerPrioridade = criarLeitorPrioridade(insumos.prioridadesOperacao);

  // --- médicos: os habilitados, menos os excluídos da rodada ---
  const excluidos = new Set(recortes.medicosExcluidos);
  const medicos = insumos.medicos.filter((m) => !excluidos.has(m.id));
  const porConta = new Map(
    insumos.medicos.flatMap((m) =>
      [...(m.outrasContas ?? []), ...(m.idMobilemed === null ? [] : [m.idMobilemed])].map(
        (conta) => [conta, m.id] as const,
      ),
    ),
  );
  const reservas: ReservaMedico[] = medicos.flatMap((m) =>
    m.arranjos
      .filter((a) => a.clientesExclusivosIds.length)
      .map((arranjo) => ({ medicoId: m.id, arranjo })),
  );

  // --- em mãos: carga, carga exclusiva e aderência (paciente + especialidade → médico) ---
  // Tudo na unidade do teto de quem está com o exame.
  const unidadeDe = new Map(insumos.medicos.map((m) => [m.id, m.unidadeTeto]));
  const carga = new Map<string, number>();
  const cargaReservada = new Map<string, number>();
  const aderente = new Map<string, string>();
  for (const e of p.leitura.emMaos) {
    const medicoId = porConta.get(e.medicoIdMobilemed);
    if (!medicoId) continue;
    const c = catalogo.classificar(e);
    const laudos = pesoNoTeto(unidadeDe.get(medicoId) ?? 'exames', e.laudos ?? 1);
    carga.set(medicoId, (carga.get(medicoId) ?? 0) + laudos);
    const clienteId = catalogo.cliente(e.unidade);
    const exclusivo = reservadoPara(reservas, {
      ...c,
      clienteId,
      unidadeId: unidadeDo(catalogo, e.unidade, clienteId),
      prioridadeOperacaoId: null,
      urgente: false,
      restanteMin: null,
    }).has(medicoId);
    if (exclusivo) cargaReservada.set(medicoId, (cargaReservada.get(medicoId) ?? 0) + laudos);
    const chave = `${chavePaciente(e.paciente)}|${c.especialidadeId ?? ''}`;
    if (c.especialidadeId && !aderente.has(chave)) aderente.set(chave, medicoId);
  }

  // --- a conta liberada na unidade: quem fica de fora de cada unidade, calculado uma vez ---
  const foraDaUnidade = new Map<number, ReadonlySet<string>>();
  for (const [unidade, contas] of p.contasPorUnidade ?? []) {
    foraDaUnidade.set(
      unidade,
      new Set(
        medicos
          .filter((m) => m.idMobilemed !== null && !contas.has(m.idMobilemed))
          .map((m) => m.id),
      ),
    );
  }

  // --- a fila ---
  let semCatalogo = 0;
  let semCliente = 0;
  const lidos: ExameLido[] = [];
  const exames = p.leitura.semMedico.map((e) => {
    const c = catalogo.classificar(e);
    const clienteId = catalogo.cliente(e.unidade);
    const unidadeId = unidadeDo(catalogo, e.unidade, clienteId);
    if (!c.exameId) semCatalogo++;
    if (!clienteId) semCliente++;
    const pacienteChave = chavePaciente(e.paciente);
    const op = lerPrioridade(e.prioridade).prioridade;
    const restanteMin = e.prazo === null ? null : (e.prazo.getTime() - agora.getTime()) / 60_000;
    lidos.push({
      ...c,
      idExame: e.idExame,
      pacienteChave,
      estudo: e.estudo,
      unidade: e.unidade,
      laudos: e.laudos ?? 1,
      realizadoEm: e.realizadoEm,
      entradaEm: e.entradaEm,
      prazo: e.prazo,
      prioridadeGrafia: e.prioridade,
      prioridadeId: e.prioridade === null ? null : catalogo.traduzirPrioridade(e.prioridade),
      prioridadeOperacaoId: op?.id ?? null,
      posicao: op?.posicao ?? null,
      urgente: op !== null && urgente(urgenciaNaFrente(op, c, regras), restanteMin),
      clienteId,
      unidadeId,
    });
    return {
      id: e.idExame,
      exameId: c.exameId,
      clienteId,
      unidadeId,
      especialidadeId: c.especialidadeId,
      especialidadesDoSegmento: c.especialidadesDoSegmento,
      modalidadeId: c.modalidadeId,
      subespecialidadeId: c.subespecialidadeId,
      prioridade: e.prioridade,
      nome: e.estudo,
      paciente: pacienteChave,
      laudos: e.laudos ?? 1,
      prazo: e.prazo,
      entradaEm: e.entradaEm,
      novo: normalizarGrafia(e.status) === STATUS_NOVO,
      medicoAderente: c.especialidadeId
        ? (aderente.get(`${pacienteChave}|${c.especialidadeId}`) ?? null)
        : null,
      entregues: p.entregas.porExame.get(e.idExame) ?? [],
      naoLiberados: e.unidadeMobilemed == null ? undefined : foraDaUnidade.get(e.unidadeMobilemed),
    };
  });

  const medicosMotor: MedicoRodada[] = medicos.map((m) => ({
    id: m.id,
    nome: m.nome,
    arranjos: m.arranjos,
    unidadeTeto: m.unidadeTeto,
    cargaEmMaos: carga.get(m.id) ?? 0,
    cargaReservadaEmMaos: cargaReservada.get(m.id) ?? 0,
    semContaMobilemed: m.idMobilemed === null,
  }));

  const filtro: FiltroRodada = {};
  if (recortes.turnoIds.length) filtro.turnoIds = recortes.turnoIds;
  const frentes = recortes.frenteIds.flatMap((id) => {
    const f = insumos.frentes[id];
    return f ? [f] : [];
  });
  if (frentes.length) filtro.frentes = frentes;
  if (recortes.prioridadeOperacaoIds.length) {
    filtro.prioridadeOperacaoIds = recortes.prioridadeOperacaoIds;
  }
  if (recortes.subespecialidadeIds.length || recortes.subespecialidadeGeral) {
    filtro.subespecialidadeIds = recortes.subespecialidadeIds;
    filtro.subespecialidadeGeral = recortes.subespecialidadeGeral;
  }
  if (recortes.clienteIds.length) filtro.clienteIds = recortes.clienteIds;
  if (recortes.medicosIncluidos.length) filtro.medicosIncluidos = recortes.medicosIncluidos;

  return {
    entrada: {
      agora,
      exames,
      medicos: medicosMotor,
      ocorrencias: insumos.ocorrencias,
      equipes: insumos.equipes,
      ajustes: insumos.ajustes,
      regrasFrente: insumos.regrasFrente,
      config: configuracaoDoMotor(insumos.config),
      prioridadesOperacao: insumos.prioridadesOperacao,
      gradeRecebimento: insumos.gradeRecebimento,
      prioridadesCliente: insumos.prioridadesCliente,
      cotaEntregue: cotaNaUnidade(p.entregas.cotaEntregue, insumos),
      filtro,
      nomes: insumos.nomes,
    },
    lidos,
    semCatalogo,
    semCliente,
  };
}
