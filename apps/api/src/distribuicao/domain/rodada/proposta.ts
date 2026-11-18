import type { ConfiguracaoGlobal } from '../configuracao-global';
import {
  criarNivelDoExame,
  type ExameMotor,
  montarFila,
  type PrioridadeCliente,
} from '../motor/fila';
import type { Barreira } from '../motor/medicos-disponiveis';
import type { MedicoNaRodada, ResultadoRodada } from '../motor/rodada';
import type { ExameLido } from './entrada';

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
}

/** Turnos e frentes em que o médico estava na escala no instante da leitura (só os nomes). */
export interface EscalaDoMedico {
  turnos: string[];
  frentes: string[];
}

/** O médico da rodada como a tela da proposta o mostra (teto, carga em mãos, turno). */
export interface MedicoGravado extends MedicoNaRodada, EscalaDoMedico {}

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
}

export interface Proposta {
  designacoes: DesignacaoNova[];
  avisos: string[];
  urgentes: number;
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

  const teto = config.tetoPorRodada;
  let previstas = 0;
  let acimaDoTeto = 0;
  const designacoes = ordem.map((id, i): DesignacaoNova => {
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
    };
  });

  const avisos: string[] = [];
  if (p.resultado.funil.medicos.noHorario === 0) {
    avisos.push('Nenhum médico habilitado está em turno agora.');
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
  if (acimaDoTeto > 0) {
    avisos.push(
      `${acimaDoTeto} exame(s) acima do teto de ${teto} por rodada ficam para a próxima.`,
    );
  }

  return {
    designacoes,
    avisos,
    urgentes: p.lidos.filter((l) => l.urgente).length,
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
      })),
    },
  };
}
