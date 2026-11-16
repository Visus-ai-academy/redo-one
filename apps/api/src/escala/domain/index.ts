export {
  type AlocacaoValidada,
  type ClassificacaoAlocacao,
  classificarAlocacao,
  type DadosAlocacao,
  type TipoTurno,
  type TurnoDaAlocacao,
  validarAlocacao,
  validarHorarioNoTurno,
  validarPeriodo,
  validarProdutividade,
} from './alocacao';
export {
  type AusenciaEscala,
  type AusenciaValidada,
  aplicaNaOcorrencia,
  aprovarAusencia,
  cancelarSolicitacao,
  type DadosAusencia,
  type OrigemAusencia,
  type RevisaoAusencia,
  type Revisor,
  recusarAusencia,
  type SituacaoAusencia,
  type TipoAusencia,
  validarAusencia,
} from './ausencia';
export {
  type CoberturaExistente,
  type CoberturaValidada,
  type DadosCobertura,
  type TitularDaCobertura,
  validarCobertura,
} from './cobertura';
export {
  type ConflitoDeHorario,
  conflitosDoMedico,
  type OcorrenciaComIntervalo,
} from './conflitos';
export {
  AcaoProibidaEscalaError,
  ConflitoEscalaError,
  EscalaInvalidaError,
  RegistroEscalaNaoEncontradoError,
} from './errors';
export {
  cabeNoTurno,
  duracaoMinutos,
  type FaixaHorario,
  type Horario,
  minutosDoDia,
  normalizarHorario,
} from './horario';
export {
  type AjusteProdutividade,
  type AlocacaoEscala,
  AUSENCIA_COBERTURA,
  type EntradaExpansao,
  expandirOcorrencias,
  type FrenteEscala,
  instanteBrasilia,
  JANELA_MAXIMA_DIAS,
  type Ocorrencia,
  OFFSET_BRASILIA,
  type TurnoEscala,
} from './ocorrencias';
export {
  adicionarDias,
  caiNasSemanas,
  caiNoDia,
  type Data,
  diaDaSemana,
  diasNoIntervalo,
  existeDiaNoPeriodo,
  normalizarDiasSemana,
  normalizarSemanasDoMes,
  type RegraRecorrencia,
  SEMANAS_DO_MES,
  validarData,
} from './recorrencia';
