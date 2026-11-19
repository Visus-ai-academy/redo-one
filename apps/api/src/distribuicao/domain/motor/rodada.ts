import type { FrenteEscala } from '../arranjo';
import { type ConfiguracaoDistribuicao, type RegrasFrente, RegrasPorFrente } from './configuracao';
import type { DirecaoEquipe } from './elegibilidade';
import {
  type ExameMotor,
  normalizar,
  type PrioridadeCliente,
  recortarClinicas,
  recortarPacotes,
  recortarPrioridades,
} from './fila';
import {
  type AjusteDia,
  type Barreira,
  type EntregaAnterior,
  type EtapaElegibilidade,
  type ExameElegivel,
  type MedicoRodada,
  type MedicosMontados,
  montarMedicosDisponiveis,
  type OcorrenciaRodada,
} from './medicos-disponiveis';
import { distribuir, type MotivoNaoDistribuido, ROTULO_MOTIVO, type TrilhaMotor } from './motor';
import {
  type CelulaRecebimento,
  criarLeitorPrioridade,
  GradeRecebimento,
  type PrioridadeOperacao,
  urgenciaNaFrente,
  urgente,
} from './prioridades-operacao';

/**
 * Uma rodada do motor, de ponta a ponta e sem banco: lê a prioridade de cada exame duas vezes (a
 * do catálogo, pelas variações, para os recortes de escala e arranjo; a da operação, pelo de-para
 * da distribuição, para a fila, a urgência e o recebimento), aplica os recortes da rodada, monta os médicos pela escala, distribui e
 * explica cada exame que ficou (motivo e texto legível). Fonte: dashboards-one `rodadas.ts`
 * (montagem da proposta) sem a leitura da MobileMed, o crédito e a gravação.
 */

/** Um exame da fila (leitura da MobileMed já casada com o catálogo). */
export interface ExameFilaRodada {
  /** Id do exame na fila (MobileMed). */
  id: string;
  /** Exame do catálogo; null = não identificado. */
  exameId: string | null;
  clienteId: string | null;
  especialidadeId: string | null;
  especialidadesDoSegmento: readonly string[];
  modalidadeId: string | null;
  subespecialidadeId: string | null;
  /** Grafia que chega da MobileMed: vira prioridade da operação pelo de-para das `prioridadesOperacao`. */
  prioridade: string | null;
  /** Nome do estudo, onde se procuram os marcadores de equilíbrio. */
  nome: string;
  /** Chave do paciente (HMAC), nunca o nome. */
  paciente: string;
  /** Carga na unidade da configuração. */
  laudos: number;
  prazo: Date | null;
  entradaEm: Date;
  /** Só exame NOVO na MobileMed é distribuído. */
  novo: boolean;
  medicoAderente: string | null;
  entregues: readonly EntregaAnterior[];
}

export interface FiltroRodada {
  turnoIds?: readonly string[];
  /** Prioridades da operação (o recorte da tela da rodada); o pacote do paciente não se parte. */
  prioridadeOperacaoIds?: readonly string[];
  /** Segmentos do catálogo; o pacote do paciente não se parte. Vazio sem o geral = sem recorte. */
  subespecialidadeIds?: readonly string[];
  /** O recorte de segmento inclui o exame sem segmento. */
  subespecialidadeGeral?: boolean;
  clienteIds?: readonly string[];
  /**
   * Frentes da escala: o exame de fora delas é recusado, e o médico entra só pelos períodos delas
   * (o de frente de modalidade também, para os exames das especialidades marcadas).
   */
  frentes?: readonly FrenteEscala[];
  /** Entram mesmo fora dos turnos e das frentes do recorte. */
  medicosIncluidos?: readonly string[];
}

export interface EntradaRodada {
  agora: Date;
  exames: readonly ExameFilaRodada[];
  medicos: readonly MedicoRodada[];
  ocorrencias: readonly OcorrenciaRodada[];
  equipes: readonly DirecaoEquipe[];
  ajustes: readonly AjusteDia[];
  regrasFrente: readonly RegrasFrente[];
  config: ConfiguracaoDistribuicao;
  /** Prioridades da operação, com o de-para de grafias (Configurações › Distribuição). */
  prioridadesOperacao: readonly PrioridadeOperacao[];
  /** Grade geral de recebimento prioridade da operação × turno; célula ausente = segue o SLA. */
  gradeRecebimento: readonly CelulaRecebimento[];
  prioridadesCliente: readonly PrioridadeCliente[];
  /** Alocação gratificada → o já executado por ela. */
  cotaEntregue: Readonly<Record<string, number>>;
  filtro?: FiltroRodada;
  /** Id → nome (prioridades, clientes, segmentos), só para os textos. */
  nomes?: Readonly<Record<string, string>>;
}

export type MotivoRodada =
  | MotivoNaoDistribuido
  | 'nao_novo'
  | 'fora_da_prioridade'
  | 'fora_da_clinica'
  | 'fora_da_frente'
  | 'fora_da_subespecialidade'
  | 'retirado_do_medico'
  | 'guardado_para_posteriores';

/** Por que nenhum médico pôde laudar o exame, pelo portão onde a elegibilidade zerou. */
export const POR_QUE_SEM_MEDICO: Record<
  Exclude<EtapaElegibilidade, 'retirado'> | 'pacote',
  string
> = {
  plantao: 'O exame é do plantão de uma equipe: o robô não o entrega a ninguém.',
  conta:
    'Nenhum médico em turno na rodada tem conta na MobileMed cadastrada: o robô não tem como atribuir a eles.',
  escala:
    'Nenhum médico da rodada tem período que aceite este exame (frente, prioridade, segmento, regra de recebimento do turno ou horário sem robô).',
  arranjo: 'Há médico no período, mas o arranjo de nenhum deles casa com o exame.',
  equipe: 'O exame é direcionado a uma equipe e nenhum membro dela pode recebê-lo nesta rodada.',
  reservado:
    'A clínica é exclusiva de outro(s) médico(s) neste recorte, e nenhum deles pode recebê-lo nesta rodada.',
  pacote:
    'Cada exame do paciente tem quem o laude, mas ninguém pode laudar o pacote inteiro (mesma especialidade).',
};

export interface ItemRodada {
  exameId: string;
  medicoId: string | null;
  motivo: MotivoRodada | null;
  detalhe: string | null;
  agrupadoCom: string | null;
  gratificado: boolean;
  alocacaoGratificadaId: string | null;
  coberturaDeId: string | null;
  /** Médicos que podiam laudar o exame nesta leitura (o "mover" e o "por quê" usam). */
  elegiveis: string[];
  /** Médico em turno → onde parou diante deste exame. */
  barrados: Record<string, Barreira>;
}

export interface ResultadoRodada {
  itens: ItemRodada[];
  totais: { exames: number; distribuidos: number; emAberto: number };
  funil: MedicosMontados['funil'];
  trilha: TrilhaMotor;
  /**
   * Grafias da MobileMed sem de-para nas prioridades da operação: os exames valeram como a
   * prioridade padrão. É o aviso para cadastrar a grafia (a tela da rodada o mostra).
   */
  grafiasSemDePara: string[];
  /** Os médicos que entraram na rodada (em turno, no recorte), como o motor os leu. */
  medicos: MedicoNaRodada[];
}

export interface MedicoNaRodada {
  id: string;
  nome: string;
  /** Teto da escala comum; null = sem teto conhecido. */
  capacidade: number | null;
  /** Carga em mãos que ocupa o teto (sem a exclusiva). */
  cargaEmMaos: number;
  cotaGratificada: number;
}

const semItem = (exameId: string, motivo: MotivoRodada, detalhe: string): ItemRodada => ({
  exameId,
  medicoId: null,
  motivo,
  detalhe,
  agrupadoCom: null,
  gratificado: false,
  alocacaoGratificadaId: null,
  coberturaDeId: null,
  elegiveis: [],
  barrados: {},
});

export function rodarMotor(entrada: EntradaRodada): ResultadoRodada {
  const { agora, config } = entrada;
  const regras = new RegrasPorFrente(entrada.regrasFrente);
  const nome = (id: string) => entrada.nomes?.[id] ?? id;
  const marcadores = config.marcadoresEquilibrio.map(normalizar).filter(Boolean);

  // --- a prioridade da operação e o resto do exame como o motor o lê ---
  const lerPrioridade = criarLeitorPrioridade(entrada.prioridadesOperacao);
  const grafiasSemDePara = new Set<string>();
  const lidos = entrada.exames.map((e) => {
    const leitura = lerPrioridade(e.prioridade);
    if (leitura.semDePara && e.prioridade?.trim()) grafiasSemDePara.add(e.prioridade.trim());
    const restanteMin = e.prazo === null ? null : (e.prazo.getTime() - agora.getTime()) / 60_000;
    const op = leitura.prioridade;
    const nomeNormal = normalizar(e.nome);
    return {
      fila: e,
      prioridadeOperacaoId: op?.id ?? null,
      posicao: op?.posicao ?? Number.MAX_SAFE_INTEGER,
      urgente: op !== null && urgente(urgenciaNaFrente(op, e, regras), restanteMin),
      restanteMin,
      marcador: marcadores.find((m) => nomeNormal.includes(m)) ?? null,
    };
  });
  // Marcada na alocação, faz o período receber as urgências (ver `urgenciaPelaAlocacao`).
  const prioridadeIdsUrgentes = entrada.prioridadesOperacao
    .filter((p) => p.urgencia.tipo === 'sempre')
    .map((p) => p.id);

  // --- recusas antes do motor ---
  const recusas = new Map<string, ItemRodada>();
  for (const l of lidos) {
    if (!l.fila.novo)
      recusas.set(
        l.fila.id,
        semItem(l.fila.id, 'nao_novo', 'Só o exame NOVO na MobileMed é distribuído.'),
      );
  }
  const filtro = entrada.filtro ?? {};
  const naoRecusados = () => lidos.filter((l) => !recusas.has(l.fila.id));
  const prioridadeOperacaoIds = filtro.prioridadeOperacaoIds ?? [];
  for (const id of recortarPrioridades(
    naoRecusados().map((l) => ({ ...l.fila, prioridadeId: l.prioridadeOperacaoId })),
    prioridadeOperacaoIds,
    regras,
  )) {
    recusas.set(
      id,
      semItem(
        id,
        'fora_da_prioridade',
        `A rodada distribui só ${prioridadeOperacaoIds.map(nome).join(', ')}.`,
      ),
    );
  }
  const subespecialidadeIds = filtro.subespecialidadeIds ?? [];
  if (subespecialidadeIds.length || filtro.subespecialidadeGeral) {
    const detalhe = `A rodada distribui só ${[
      ...subespecialidadeIds.map(nome),
      ...(filtro.subespecialidadeGeral ? ['Sem subespecialidade'] : []),
    ].join(', ')}.`;
    const fora = recortarPacotes(
      naoRecusados().map((l) => l.fila),
      (e) =>
        e.subespecialidadeId === null
          ? !!filtro.subespecialidadeGeral
          : subespecialidadeIds.includes(e.subespecialidadeId),
      regras,
    );
    for (const id of fora) {
      recusas.set(id, semItem(id, 'fora_da_subespecialidade', detalhe));
    }
  }
  const frentes = filtro.frentes ?? [];
  if (frentes.length) {
    const esp = new Set(frentes.flatMap((f) => (f.especialidadeId ? [f.especialidadeId] : [])));
    const mod = new Set(frentes.flatMap((f) => (f.modalidadeId ? [f.modalidadeId] : [])));
    const detalhe = `A rodada distribui só ${frentes
      .map((f) => nome(f.especialidadeId ?? f.modalidadeId ?? ''))
      .join(', ')}.`;
    for (const l of naoRecusados()) {
      const dentro =
        (l.fila.especialidadeId !== null && esp.has(l.fila.especialidadeId)) ||
        (l.fila.modalidadeId !== null && mod.has(l.fila.modalidadeId));
      if (!dentro) recusas.set(l.fila.id, semItem(l.fila.id, 'fora_da_frente', detalhe));
    }
  }
  const clienteIds = filtro.clienteIds ?? [];
  for (const id of recortarClinicas(
    naoRecusados().map((l) => l.fila),
    clienteIds,
  )) {
    recusas.set(
      id,
      semItem(id, 'fora_da_clinica', `A rodada distribui só ${clienteIds.map(nome).join(', ')}.`),
    );
  }
  const validos = naoRecusados();

  // --- elegibilidade pela escala ---
  const elegiveis: ExameElegivel[] = validos.map((l) => ({
    id: l.fila.id,
    especialidadeId: l.fila.especialidadeId,
    especialidadesDoSegmento: l.fila.especialidadesDoSegmento,
    modalidadeId: l.fila.modalidadeId,
    subespecialidadeId: l.fila.subespecialidadeId,
    prioridadeOperacaoId: l.prioridadeOperacaoId,
    urgente: l.urgente,
    exameId: l.fila.exameId,
    clienteId: l.fila.clienteId,
    restanteMin: l.restanteMin,
    entregues: l.fila.entregues,
  }));
  const montados = montarMedicosDisponiveis({
    agora,
    exames: elegiveis,
    medicos: entrada.medicos,
    ocorrencias: entrada.ocorrencias,
    equipes: entrada.equipes,
    ajustes: entrada.ajustes,
    regras,
    config,
    grade: new GradeRecebimento(entrada.gradeRecebimento, regras),
    prioridadeIdsUrgentes,
    cotaEntregue: entrada.cotaEntregue,
    ...(filtro.turnoIds ? { filtroTurnoIds: filtro.turnoIds } : {}),
    ...(frentes.length ? { filtroFrentes: frentes } : {}),
    ...(filtro.medicosIncluidos ? { medicosIncluidos: filtro.medicosIncluidos } : {}),
  });

  // --- o motor ---
  const exames: ExameMotor[] = validos.map((l) => ({
    id: l.fila.id,
    laudos: l.fila.laudos,
    especialidadeId: l.fila.especialidadeId,
    modalidadeId: l.fila.modalidadeId,
    subespecialidadeId: l.fila.subespecialidadeId,
    clienteId: l.fila.clienteId,
    posicao: l.posicao,
    urgente: l.urgente,
    paciente: l.fila.paciente,
    restanteMin: l.restanteMin,
    entradaEm: l.fila.entradaEm,
    marcador: l.marcador,
    medicoAderente: l.fila.medicoAderente,
  }));
  const resultado = distribuir({
    agora,
    exames,
    medicos: montados.medicos,
    config,
    regras,
    prioridadesCliente: entrada.prioridadesCliente,
    ...(entrada.nomes ? { nomes: entrada.nomes } : {}),
  });

  // --- cada exame com o seu destino ou o porquê ---
  const designacao = new Map(resultado.designacoes.map((d) => [d.exameId, d]));
  const naoDistribuido = new Map(resultado.naoDistribuidos.map((n) => [n.exameId, n]));
  const itens = entrada.exames.map((e): ItemRodada => {
    const recusa = recusas.get(e.id);
    if (recusa) return recusa;
    const explicado = (i: Omit<ItemRodada, 'elegiveis' | 'barrados'>): ItemRodada => ({
      ...i,
      ...montados.explicacao(e.id),
    });
    const d = designacao.get(e.id);
    if (d) {
      return explicado({
        exameId: e.id,
        medicoId: d.medicoId,
        motivo: null,
        detalhe: null,
        agrupadoCom: d.agrupadoCom,
        gratificado: d.gratificado,
        alocacaoGratificadaId: d.gratificado ? montados.gratificadoPara(d.medicoId, e.id) : null,
        coberturaDeId: montados.coberturaPara(d.medicoId, e.id),
      });
    }
    const n = naoDistribuido.get(e.id);
    if (n?.motivo !== 'sem_medico_elegivel') {
      return explicado(
        semItem(
          e.id,
          n?.motivo ?? 'sem_medico_elegivel',
          n ? `${ROTULO_MOTIVO[n.motivo]}. ${n.detalhe}` : '',
        ),
      );
    }
    const etapa = montados.etapaElegibilidade.get(e.id);
    if (etapa === 'retirado') {
      const barreiras = Object.values(montados.explicacao(e.id).barrados);
      const naConferencia = barreiras.includes('retirado_na_conferencia');
      const recolhido = barreiras.includes('recolhido');
      return explicado(
        semItem(
          e.id,
          'retirado_do_medico',
          naConferencia
            ? 'Quem laudaria este exame o teve retirado na conferência de uma rodada: o robô não o devolve a ele.'
            : recolhido
              ? 'Só quem o tinha (e de quem foi recolhido) laudaria este exame: o robô não o devolve a ele.'
              : 'Quem laudaria este exame já o recebeu do robô e o teve retirado.',
        ),
      );
    }
    if (etapa === 'escala' && montados.guardadosParaPosteriores.has(e.id)) {
      return explicado(
        semItem(
          e.id,
          'guardado_para_posteriores',
          'A Lista que segue o SLA neste dia levaria este exame, mas ele vence antes do fim dos turnos posteriores e fica para eles.',
        ),
      );
    }
    return explicado(semItem(e.id, 'sem_medico_elegivel', POR_QUE_SEM_MEDICO[etapa ?? 'pacote']));
  });

  const distribuidos = itens.filter((i) => i.medicoId !== null).length;
  return {
    itens,
    totais: { exames: itens.length, distribuidos, emAberto: itens.length - distribuidos },
    funil: montados.funil,
    trilha: resultado.trilha,
    grafiasSemDePara: [...grafiasSemDePara].sort(),
    medicos: montados.medicos.map((m) => ({
      id: m.id,
      nome: m.nome,
      capacidade: m.capacidade,
      cargaEmMaos: m.cargaInicial,
      cotaGratificada: m.cotaGratificada,
    })),
  };
}
