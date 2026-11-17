import { type ConfiguracaoDistribuicao, type RegrasFrente, RegrasPorFrente } from './configuracao';
import type { DirecaoEquipe } from './elegibilidade';
import {
  type ExameMotor,
  ehUrgente,
  normalizar,
  type PrioridadeCliente,
  recortarClinicas,
  recortarPrioridades,
} from './fila';
import {
  type AjusteDia,
  type EtapaElegibilidade,
  type ExameElegivel,
  type MedicoRodada,
  type MedicosMontados,
  montarMedicosDisponiveis,
  type OcorrenciaRodada,
} from './medicos-disponiveis';
import { distribuir, type MotivoNaoDistribuido, ROTULO_MOTIVO, type TrilhaMotor } from './motor';

/**
 * Uma rodada do motor, de ponta a ponta e sem banco: traduz a prioridade de cada exame pelas
 * variações do catálogo, aplica os recortes da rodada, monta os médicos pela escala, distribui e
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
  /** Grafia que chega da MobileMed; vira prioridade do catálogo por `traduzirPrioridade`. */
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
  entregues: readonly { medicoId: string; em: Date }[];
}

export interface FiltroRodada {
  turnoIds?: readonly string[];
  /** Prioridades do catálogo. */
  prioridadeIds?: readonly string[];
  clienteIds?: readonly string[];
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
  /** Grafia da MobileMed → prioridade do catálogo (pelas variações); null = sem tradução. */
  traduzirPrioridade: (grafia: string) => string | null;
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
  | 'retirado_do_medico'
  | 'guardado_para_posteriores';

/** Por que nenhum médico pôde laudar o exame, pelo portão onde a elegibilidade zerou. */
export const POR_QUE_SEM_MEDICO: Record<
  Exclude<EtapaElegibilidade, 'retirado'> | 'pacote',
  string
> = {
  plantao: 'O exame é do plantão de uma equipe: o robô não o entrega a ninguém.',
  escala:
    'Nenhum médico da rodada tem período que aceite este exame (frente, prioridade, segmento, regra da Lista ou horário sem robô).',
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
}

export interface ResultadoRodada {
  itens: ItemRodada[];
  totais: { exames: number; distribuidos: number; emAberto: number };
  funil: MedicosMontados['funil'];
  trilha: TrilhaMotor;
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
});

export function rodarMotor(entrada: EntradaRodada): ResultadoRodada {
  const { agora, config } = entrada;
  const regras = new RegrasPorFrente(entrada.regrasFrente);
  const nome = (id: string) => entrada.nomes?.[id] ?? id;
  const marcadores = config.marcadoresEquilibrio.map(normalizar).filter(Boolean);

  // --- a prioridade do catálogo e o resto do exame como o motor o lê ---
  const lidos = entrada.exames.map((e) => {
    const prioridadeId = e.prioridade === null ? null : entrada.traduzirPrioridade(e.prioridade);
    const nomeNormal = normalizar(e.nome);
    return {
      fila: e,
      prioridadeId,
      restanteMin: e.prazo === null ? null : (e.prazo.getTime() - agora.getTime()) / 60_000,
      marcador: marcadores.find((m) => nomeNormal.includes(m)) ?? null,
    };
  });

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
  const prioridadeIds = filtro.prioridadeIds ?? [];
  for (const id of recortarPrioridades(
    naoRecusados().map((l) => ({ ...l.fila, prioridadeId: l.prioridadeId })),
    prioridadeIds,
    regras,
  )) {
    recusas.set(
      id,
      semItem(
        id,
        'fora_da_prioridade',
        `A rodada distribui só ${prioridadeIds.map(nome).join(', ')}.`,
      ),
    );
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
    prioridadeId: l.prioridadeId,
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
    cotaEntregue: entrada.cotaEntregue,
    ...(filtro.turnoIds ? { filtroTurnoIds: filtro.turnoIds } : {}),
  });

  // --- o motor ---
  const exames: ExameMotor[] = validos.map((l) => ({
    id: l.fila.id,
    laudos: l.fila.laudos,
    especialidadeId: l.fila.especialidadeId,
    modalidadeId: l.fila.modalidadeId,
    subespecialidadeId: l.fila.subespecialidadeId,
    clienteId: l.fila.clienteId,
    urgente: ehUrgente(l.prioridadeId, config),
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
    const d = designacao.get(e.id);
    if (d) {
      return {
        exameId: e.id,
        medicoId: d.medicoId,
        motivo: null,
        detalhe: null,
        agrupadoCom: d.agrupadoCom,
        gratificado: d.gratificado,
        alocacaoGratificadaId: d.gratificado ? montados.gratificadoPara(d.medicoId, e.id) : null,
        coberturaDeId: montados.coberturaPara(d.medicoId, e.id),
      };
    }
    const n = naoDistribuido.get(e.id);
    if (n?.motivo !== 'sem_medico_elegivel') {
      return semItem(
        e.id,
        n?.motivo ?? 'sem_medico_elegivel',
        n ? `${ROTULO_MOTIVO[n.motivo]}. ${n.detalhe}` : '',
      );
    }
    const etapa = montados.etapaElegibilidade.get(e.id);
    if (etapa === 'retirado') {
      return semItem(
        e.id,
        'retirado_do_medico',
        'Quem laudaria este exame já o recebeu do robô e o teve retirado.',
      );
    }
    if (etapa === 'escala' && montados.guardadosParaPosteriores.has(e.id)) {
      return semItem(
        e.id,
        'guardado_para_posteriores',
        'A Lista que segue o SLA levaria este exame, mas ele vence antes do fim dos turnos posteriores e fica para eles.',
      );
    }
    return semItem(e.id, 'sem_medico_elegivel', POR_QUE_SEM_MEDICO[etapa ?? 'pacote']);
  });

  const distribuidos = itens.filter((i) => i.medicoId !== null).length;
  return {
    itens,
    totais: { exames: itens.length, distribuidos, emAberto: itens.length - distribuidos },
    funil: montados.funil,
    trilha: resultado.trilha,
  };
}
