import type { DependenciasRodada } from './comum';
import {
  BuscarMedicosDaRodada,
  ConsultarFilaDoMomento,
  ConsultarResumo,
  ConsultarRodada,
  ConsultarSituacao,
  ExplicarDesignacao,
  ListarDesignacoes,
} from './consultas';
import {
  AjustarMedicosRodada,
  AjustarProposta,
  AprovarRodada,
  CancelarRodada,
  EncerrarRodada,
  PausarRodada,
  RelerRodada,
  RetomarRodada,
} from './controlar';
import { CriarRodada } from './criar';
import { ExecutarRodada } from './executar';
import { LerFila } from './ler-fila';
import { PreverRecolhimento } from './recolhimento';

export type { AtorRodada, DependenciasRodada } from './comum';
export type { RecolhimentoPrevisto } from './recolhimento';
export {
  AjustarMedicosRodada,
  AjustarProposta,
  AprovarRodada,
  BuscarMedicosDaRodada,
  CancelarRodada,
  ConsultarFilaDoMomento,
  ConsultarResumo,
  ConsultarRodada,
  ConsultarSituacao,
  CriarRodada,
  EncerrarRodada,
  ExecutarRodada,
  ExplicarDesignacao,
  LerFila,
  ListarDesignacoes,
  PausarRodada,
  PreverRecolhimento,
  RelerRodada,
  RetomarRodada,
};

/**
 * Os casos de uso da rodada, cada um chamado igual pela tela e pelo job. Montados juntos porque
 * dividem as mesmas portas.
 */
export function criarCasosDeUsoRodada(d: DependenciasRodada) {
  return {
    criar: new CriarRodada(d),
    lerFila: new LerFila(d),
    ajustarProposta: new AjustarProposta(d),
    aprovar: new AprovarRodada(d),
    executar: new ExecutarRodada(d),
    pausar: new PausarRodada(d),
    retomar: new RetomarRodada(d),
    encerrar: new EncerrarRodada(d),
    cancelar: new CancelarRodada(d),
    reler: new RelerRodada(d),
    ajustarMedicos: new AjustarMedicosRodada(d),
    situacao: new ConsultarSituacao(d),
    consultar: new ConsultarRodada(d),
    designacoes: new ListarDesignacoes(d),
    filaDoMomento: new ConsultarFilaDoMomento(d),
    resumo: new ConsultarResumo(d),
    explicar: new ExplicarDesignacao(d),
    buscarMedicos: new BuscarMedicosDaRodada(d),
    recolhimentoPrevisto: new PreverRecolhimento(d),
  };
}

export type CasosDeUsoRodada = ReturnType<typeof criarCasosDeUsoRodada>;
