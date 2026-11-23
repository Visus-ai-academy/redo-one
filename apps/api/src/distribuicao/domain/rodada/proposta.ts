import type { ConfiguracaoGlobal } from '../configuracao-global';
import type { UnidadeTeto } from '../motor/capacidade';
import {
  criarNivelDoExame,
  type ExameMotor,
  montarFila,
  type PrioridadeCliente,
} from '../motor/fila';
import type { Barreira } from '../motor/medicos-disponiveis';
import type { MedicoForaDaRodada, MedicoNaRodada, ResultadoRodada } from '../motor/rodada';
import type { ExameLido } from './entrada';
import type { MotivoFica, MotivoRecolhimento, Recolhimento } from './recolhimento';

/**
 * A proposta gravada: uma designação por exame lido (inclusive os recusados, com o motivo), na
 * ordem da fila do motor. Fonte: dashboards-one `registrarPrevia` (teto por rodada e avisos).
 */

export type StatusDesignacao = 'prevista' | 'executada' | 'pulada' | 'falhou' | 'recusada';

export interface DesignacaoNova extends ExameLido {
  ordem: number;
  medicoPropostoId: string | null;
  medicoId: string | null;
  agrupadoCom: string | null;
  gratificado: boolean;
  alocacaoGratificadaId: string | null;
  coberturaDeId: string | null;
  status: 'prevista' | 'recusada';
  motivo: string | null;
  detalhe: string | null;
  /** Quem podia laudar o exame nesta leitura. */
  elegiveis: string[];
  /** Médico em turno → onde parou diante do exame (o "por que este médico não pegou"). */
  barrados: Record<string, Barreira>;
  /** Mandado a um médico na conferência, depois que o motor o deixou de fora. */
  naMao: boolean;
  /** Recolhido: de quem sai (a execução só troca se ainda estiver com ele, NOVO). */
  recolhidoDeId: string | null;
  motivoRecolhimento: MotivoRecolhimento | null;
}

/** O recolhimento da leitura, para o funil e o diário. */
export interface RecolhimentoGravado {
  /** Exames que saíram dos médicos e entraram na rodada. */
  recolhiveis: number;
  /** Desses, os de médico com ausência no dia. */
  porAusencia: number;
  /** Desses, os que o robô propôs a outro médico. */
  propostos: number;
  /** Desses, os que ninguém da rodada podia pegar: ficam com quem tem. */
  semDestino: number;
  /** Os que podiam ser recolhidos e ficaram com o médico, por motivo. */
  naoRecolhidos: Record<MotivoFica, number>;
}

/** Turnos e frentes em que o médico estava na escala no instante da leitura (só os nomes). */
export interface EscalaDoMedico {
  /** Turnos em andamento na leitura. */
  turnos: string[];
  frentes: string[];
  /**
   * Turnos que ainda não tinham começado, mas já entravam na rodada (antecedência ou turno
   * escolhido), com o início (ISO). Ausente nas leituras gravadas antes dele.
   */
  aComecar?: { turno: string; inicio: string }[];
}

/** O médico da rodada como a tela da proposta o mostra (teto, carga em mãos, turno). */
export interface MedicoGravado extends Omit<MedicoNaRodada, 'unidadeTeto'>, EscalaDoMedico {
  /** Ausente nas gravadas antes da unidade por médico (23/11), quando o motor somava os laudos. */
  unidadeTeto?: UnidadeTeto;
}

/** O que o motor viu, guardado para o "por que este médico não pegou" (passo 5). */
export interface InsumosGravados {
  leituraEm: string;
  funil: ResultadoRodada['funil'];
  trilha: ResultadoRodada['trilha'];
  grafiasSemDePara: string[];
  /** Ativos e habilitados no robô no instante da leitura. */
  habilitados: string[];
  /** Os médicos que entraram na rodada. */
  medicos: MedicoGravado[];
  /** Os da escala que ficaram de fora, com o motivo. Ausente nas leituras gravadas antes dele. */
  foraDaRodada?: MedicoForaDaRodada[];
  /** Ausente nas leituras gravadas antes do recolhimento (ou com ele desligado). */
  recolhimento?: RecolhimentoGravado;
}

export interface Proposta {
  designacoes: DesignacaoNova[];
  avisos: string[];
  /** Urgências entre os exames da proposta (os lidos e os recolhidos que entraram). */
  urgentes: number;
  /** Recolhidos que entraram na proposta. */
  recolhidos: number;
  insumos: InsumosGravados;
}

const SEM_POSICAO = Number.MAX_SAFE_INTEGER;

/** Os campos que decidem a ordem da fila (a da leitura e a da execução). */
export interface ItemDaOrdem {
  id: string;
  posicao: number | null;
  urgente: boolean;
  prazo: Date | null;
  entradaEm: Date;
  clienteId: string | null;
  unidadeId?: string | null;
  especialidadeId: string | null;
  modalidadeId: string | null;
}

/**
 * A ordem da fila do motor no instante (posição da prioridade, prazo crítico e nível do cliente,
 * prazo, chegada): a execução atribui nesta ordem, para a urgência aprovada não esperar a vez.
 */
export function ordemDeExecucao(
  itens: readonly ItemDaOrdem[],
  config: Pick<ConfiguracaoGlobal, 'ordemFila' | 'prazoCriticoMin'>,
  prioridadesCliente: readonly PrioridadeCliente[],
  agora: Date,
): string[] {
  const comoMotor: ExameMotor[] = itens.map((i) => ({
    id: i.id,
    laudos: 1,
    especialidadeId: i.especialidadeId,
    modalidadeId: i.modalidadeId,
    subespecialidadeId: null,
    clienteId: i.clienteId,
    unidadeId: i.unidadeId ?? null,
    posicao: i.posicao ?? SEM_POSICAO,
    urgente: i.urgente,
    paciente: i.id,
    restanteMin: i.prazo === null ? null : (i.prazo.getTime() - agora.getTime()) / 60_000,
    entradaEm: i.entradaEm,
    marcador: null,
    medicoAderente: null,
  }));
  return montarFila(comoMotor, config, criarNivelDoExame(prioridadesCliente)).map((e) => e.id);
}

export function montarProposta(p: {
  agora: Date;
  lidos: readonly ExameLido[];
  resultado: ResultadoRodada;
  config: ConfiguracaoGlobal;
  prioridadesCliente: readonly PrioridadeCliente[];
  semCatalogo: number;
  semCliente: number;
  escalaDosMedicos: Readonly<Record<string, EscalaDoMedico>>;
  habilitados: string[];
  /**
   * Os exames recolhidos (já entre os lidos). O que o motor propôs a outro médico entra marcado;
   * o que ninguém pega segue com quem tem e fica fora da proposta (como no dashboards-one).
   */
  recolhimento?: Recolhimento;
}): Proposta {
  const { config } = p;
  const item = new Map(p.resultado.itens.map((i) => [i.exameId, i]));
  const lidoPorId = new Map(p.lidos.map((l) => [l.idExame, l]));
  const ordem = ordemDeExecucao(
    p.lidos.map((l) => ({ ...l, id: l.idExame })),
    config,
    p.prioridadesCliente,
    p.agora,
  );

  const recolhidoDe = new Map((p.recolhimento?.recolhidos ?? []).map((r) => [r.idExame, r]));
  const teto = config.tetoPorRodada;
  let previstas = 0;
  let acimaDoTeto = 0;
  const todas = ordem.map((id, i): DesignacaoNova => {
    const l = lidoPorId.get(id) as ExameLido;
    const it = item.get(id);
    const medico = it?.medicoId ?? null;
    const passou = medico !== null && teto !== null && previstas >= teto;
    if (medico !== null && !passou) previstas++;
    if (passou) acimaDoTeto++;
    const vai = medico !== null && !passou;
    return {
      ...l,
      ordem: i,
      medicoPropostoId: medico,
      medicoId: vai ? medico : null,
      agrupadoCom: it?.agrupadoCom ?? null,
      gratificado: vai && (it?.gratificado ?? false),
      alocacaoGratificadaId: vai ? (it?.alocacaoGratificadaId ?? null) : null,
      coberturaDeId: vai ? (it?.coberturaDeId ?? null) : null,
      status: vai ? 'prevista' : 'recusada',
      motivo: passou ? 'teto_da_rodada' : vai ? null : (it?.motivo ?? 'sem_medico_elegivel'),
      detalhe: passou
        ? `Acima do teto de ${teto} exame(s) por rodada: fica para a próxima.`
        : vai
          ? null
          : (it?.detalhe ?? null),
      elegiveis: it?.elegiveis ?? [],
      barrados: it?.barrados ?? {},
      naMao: false,
      recolhidoDeId: recolhidoDe.get(id)?.deMedicoId ?? null,
      motivoRecolhimento: recolhidoDe.get(id)?.motivo ?? null,
    };
  });
  const designacoes = todas.filter((d) => d.recolhidoDeId === null || d.status === 'prevista');
  const recolhidos = designacoes.filter((d) => d.recolhidoDeId !== null).length;

  const avisos: string[] = [];
  if (p.resultado.funil.medicos.noHorario === 0) {
    avisos.push('Nenhum médico habilitado está em turno agora.');
  } else if (p.resultado.funil.medicos.comConta === 0) {
    avisos.push(
      'Nenhum médico em turno tem conta na MobileMed cadastrada: cadastre o id da MobileMed em Médicos.',
    );
  }
  if (p.semCatalogo > 0) {
    avisos.push(`${p.semCatalogo} exame(s) com estudo fora do catálogo: cadastre em Exames.`);
  }
  if (p.semCliente > 0) {
    avisos.push(
      `${p.semCliente} exame(s) com unidade sem cliente cadastrado: as regras de cliente não valem para eles.`,
    );
  }
  if (p.resultado.grafiasSemDePara.length) {
    avisos.push(
      `Prioridade da MobileMed sem de-para na distribuição: ${p.resultado.grafiasSemDePara.join(', ')} (valeu como a padrão). Cadastre em Configurações › Distribuição.`,
    );
  }
  const r = p.recolhimento;
  if (r?.recolhidos.length) {
    const ausentes = r.recolhidos.filter((x) => x.motivo === 'ausencia').length;
    const ficam = r.recolhidos.length - recolhidos;
    avisos.push(
      `Recolhimento: ${r.recolhidos.length} exame(s) intocado(s) de médico fora do turno ou ausente` +
        (ausentes ? ` (${ausentes} por ausência)` : '') +
        `; ${recolhidos} vão para outro médico nesta proposta` +
        (ficam ? `, ${ficam} fica(m) com quem tem.` : '.'),
    );
  }
  if (acimaDoTeto > 0) {
    avisos.push(
      `${acimaDoTeto} exame(s) acima do teto de ${teto} por rodada ficam para a próxima.`,
    );
  }

  return {
    designacoes,
    avisos,
    urgentes: designacoes.filter((d) => d.urgente).length,
    recolhidos,
    insumos: {
      leituraEm: p.agora.toISOString(),
      funil: p.resultado.funil,
      trilha: p.resultado.trilha,
      grafiasSemDePara: p.resultado.grafiasSemDePara,
      habilitados: p.habilitados,
      medicos: p.resultado.medicos.map((m) => ({
        ...m,
        turnos: p.escalaDosMedicos[m.id]?.turnos ?? [],
        frentes: p.escalaDosMedicos[m.id]?.frentes ?? [],
        aComecar: p.escalaDosMedicos[m.id]?.aComecar ?? [],
      })),
      foraDaRodada: p.resultado.foraDaRodada,
      ...(r
        ? {
            recolhimento: {
              recolhiveis: r.recolhidos.length,
              porAusencia: r.recolhidos.filter((x) => x.motivo === 'ausencia').length,
              propostos: recolhidos,
              semDestino: r.recolhidos.length - recolhidos,
              naoRecolhidos: r.ficaram,
            },
          }
        : {}),
    },
  };
}

/**
 * A frente em que a proposta mostra o exame, entre as que casam com ele (em ordem de preferência:
 * a de especialidade antes da de modalidade; null = não casa). Fica numa frente marcada na rodada:
 * se só a de modalidade estiver marcada, vai para ela. Sem frente marcada (ou nenhuma das do exame
 * marcada), a primeira que casa.
 */
export function frenteNaRodada<F extends { id: string }>(
  candidatas: readonly (F | null)[],
  marcadas: readonly string[],
): F | null {
  const casam = candidatas.filter((f): f is F => f !== null);
  return casam.find((f) => marcadas.includes(f.id)) ?? casam[0] ?? null;
}
