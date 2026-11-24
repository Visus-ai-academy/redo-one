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
  /**
   * Carência do recolhimento depois do fim da Lista (no lugar da de cima): o exame entregue numa
   * Lista fica com o médico até estes minutos depois do fim dela. No dashboards-one,
   * `CARENCIA_LISTA_MIN` (24 h, fixo no código).
   */
  recolhimentoAposListaMin: number;
  /** Desligado, ninguém inicia rodada (no dashboards-one, `roboAtivo`). */
  roboAtivo: boolean;
  /** Minutos que a proposta vale antes de expirar sem aprovação (`roboExpiracaoMin`). */
  expiracaoPropostaMin: number;
  /** Máximo de exames propostos por rodada; null = sem teto (`roboTetoPorRodada`). */
  tetoPorRodada: number | null;
  /**
   * De quantos em quantos minutos um job lê a fila da MobileMed e grava o retrato que a fila do
   * momento mostra (a tela não lê a MobileMed). Null = leitura automática desligada (só "Ler
   * agora"). Não distribui nada: a rodada lê a fila ao vivo.
   */
  retratoFilaMin: number | null;
  /**
   * Por quantos minutos vale a lista de médicos (contas) liberados em cada unidade na MobileMed,
   * guardada na memória da API entre rodadas: a proposta não oferece o exame a quem não está
   * liberado na unidade dele. 0 = relê a cada rodada; null = a proposta não confere (a execução
   * sempre confere na hora).
   */
  contasUnidadeValidadeMin: number | null;
}

/** Os campos do robô: a tela de antes deles não os manda, e o PUT sem eles mantém os gravados. */
export type CamposRobo =
  | 'roboAtivo'
  | 'expiracaoPropostaMin'
  | 'tetoPorRodada'
  | 'retratoFilaMin'
  | 'contasUnidadeValidadeMin';
export type EdicaoConfiguracaoGlobal = Omit<ConfiguracaoGlobal, CamposRobo> &
  Partial<Pick<ConfiguracaoGlobal, CamposRobo>>;

/**
 * Valores enquanto ninguém salvou a configuração (sem linha no banco). Os números são os de
 * produção do dashboards-one; os turnos posteriores ficam vazios, e a carga do dashboards-one grava a configuração de verdade.
 */
export const CONFIGURACAO_INICIAL: ConfiguracaoGlobal = {
  ordemFila: [
    { criterio: 'prioridade', direcao: 'desc' },
    { criterio: 'prazo', direcao: 'asc' },
    { criterio: 'antiguidade', direcao: 'asc' },
  ],
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
  recolhimentoAposTurnoMin: 60,
  recolhimentoAposListaMin: 1440,
  roboAtivo: true,
  expiracaoPropostaMin: 45,
  tetoPorRodada: null,
  retratoFilaMin: 5,
  contasUnidadeValidadeMin: 240,
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
  inteiroEntre(
    c.recolhimentoAposListaMin,
    0,
    10_080,
    'Carência do recolhimento na Lista (minutos)',
  );

  inteiroEntre(c.expiracaoPropostaMin, 1, 1440, 'Validade da proposta (minutos)');
  if (c.tetoPorRodada !== null) {
    inteiroEntre(c.tetoPorRodada, 1, 100_000, 'Teto de exames por rodada');
  }
  if (c.retratoFilaMin !== null) {
    inteiroEntre(c.retratoFilaMin, 1, 1440, 'Leitura da fila do momento (minutos)');
  }
  if (c.contasUnidadeValidadeMin !== null) {
    inteiroEntre(
      c.contasUnidadeValidadeMin,
      0,
      10_080,
      'Validade da lista de médicos por unidade (minutos)',
    );
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
}
