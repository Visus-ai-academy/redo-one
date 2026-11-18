import type { ConfiguracaoDistribuicao } from './motor/configuracao';
import {
  ConfiguracaoInvalidaError,
  inteiroEntre,
  invalida,
  semRepetidos,
  validarHorario,
} from './validacao';

export { ConfiguracaoInvalidaError };

/**
 * Configurações › Distribuição: o que o motor lê (`ConfiguracaoDistribuicao`) e o que o
 * recolhimento vai ler. Uma linha só, editável por tela com auditoria.
 */
export interface ConfiguracaoGlobal extends ConfiguracaoDistribuicao {
  /**
   * Carência do recolhimento: exame entregue, não aberto e com o turno encerrado há estes minutos
   * volta para a fila (nas frentes que recolhem). Null = recolhimento desligado. No dashboards-one,
   * `roboRecolherAposTurnoMin` (60 em produção). O motor não usa; o recolhimento (passo 5) usa.
   */
  recolhimentoAposTurnoMin: number | null;
}

/**
 * Valores enquanto ninguém salvou a configuração (sem linha no banco). Os números são os de
 * produção do dashboards-one; as listas que dependem do catálogo (urgentes, Lista, turnos
 * posteriores) ficam vazias, e a carga do dashboards-one grava a configuração de verdade.
 */
export const CONFIGURACAO_INICIAL: ConfiguracaoGlobal = {
  ordemFila: [
    { criterio: 'prioridade', direcao: 'desc' },
    { criterio: 'prazo', direcao: 'asc' },
    { criterio: 'antiguidade', direcao: 'asc' },
  ],
  prioridadeIdsUrgentes: [],
  agruparPorPaciente: true,
  janelaPacienteHoras: 0,
  toleranciaAcimaTeto: 0,
  margemUrgenciaPct: 10,
  folgaProporcaoPct: 20,
  prazoCriticoMin: 60,
  antecedenciaPeriodoMin: 180,
  cicloMinutos: 30,
  marcadoresEquilibrio: [],
  escalaRestringeEspecialidade: true,
  diasJaEntregue: 7,
  turnosPosteriores: null,
  lista: { prioridadeIds: [], prazoMinimoHoras: 24 },
  recolhimentoAposTurnoMin: 60,
};

const CRITERIOS = new Set(['prioridade', 'prazo', 'antiguidade']);
const DIRECOES = new Set(['asc', 'desc']);

/** Apara os marcadores (o resto já chega no formato). */
export function normalizarConfiguracao(c: ConfiguracaoGlobal): ConfiguracaoGlobal {
  return { ...c, marcadoresEquilibrio: c.marcadoresEquilibrio.map((m) => m.trim()) };
}

export function validarConfiguracaoGlobal(c: ConfiguracaoGlobal): void {
  if (!c.ordemFila.length) invalida('A ordem da fila precisa de ao menos um critério.');
  for (const item of c.ordemFila) {
    if (!CRITERIOS.has(item.criterio) || !DIRECOES.has(item.direcao)) {
      invalida('Critério ou direção da ordem da fila desconhecido.');
    }
  }
  semRepetidos(
    c.ordemFila.map((i) => i.criterio),
    'Há critério repetido na ordem da fila.',
  );
  semRepetidos(c.prioridadeIdsUrgentes, 'Há prioridade urgente repetida.');

  inteiroEntre(c.janelaPacienteHoras, 0, 720, 'Janela do pacote do paciente (horas)');
  inteiroEntre(c.toleranciaAcimaTeto, 0, 100, 'Tolerância acima do teto');
  inteiroEntre(c.margemUrgenciaPct, 0, 100, 'Margem de urgência (%)');
  inteiroEntre(c.folgaProporcaoPct, 0, 100, 'Folga da proporção (pontos percentuais)');
  inteiroEntre(c.prazoCriticoMin, 0, 1440, 'Prazo crítico (minutos)');
  inteiroEntre(c.antecedenciaPeriodoMin, 0, 1440, 'Antecedência do período (minutos)');
  inteiroEntre(c.cicloMinutos, 1, 1440, 'Ciclo entre rodadas (minutos)');
  inteiroEntre(c.diasJaEntregue, 0, 90, 'Dias do "já entregue"');
  if (c.recolhimentoAposTurnoMin !== null) {
    inteiroEntre(c.recolhimentoAposTurnoMin, 0, 1440, 'Carência do recolhimento (minutos)');
  }

  const marcadores = c.marcadoresEquilibrio.map((m) => m.trim());
  if (marcadores.some((m) => !m)) invalida('Há marcador vazio no equilíbrio.');
  semRepetidos(
    marcadores.map((m) => m.toUpperCase()),
    'Há marcador repetido no equilíbrio.',
  );

  if (c.turnosPosteriores) {
    if (!c.turnosPosteriores.turnoIds.length) {
      invalida('Escolha ao menos um turno posterior, ou desligue os turnos posteriores.');
    }
    semRepetidos(c.turnosPosteriores.turnoIds, 'Há turno repetido nos turnos posteriores.');
    validarHorario(c.turnosPosteriores.cheiaEm, 'Hora da cheia dos turnos posteriores');
  }

  semRepetidos(c.lista.prioridadeIds, 'Há prioridade da Lista repetida.');
  if (c.lista.prazoMinimoHoras !== null) {
    inteiroEntre(c.lista.prazoMinimoHoras, 0, 720, 'Prazo mínimo da Lista (horas)');
  }
}
