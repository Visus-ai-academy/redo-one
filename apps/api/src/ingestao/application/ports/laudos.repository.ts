import type { Celula } from '../../domain/celulas';
import type { LaudoExistente } from '../../domain/planejar-importacao';
import type { LaudoPreparado, OrigemLaudo } from '../../domain/preparar-laudo';

export const LAUDOS_REPOSITORY = Symbol('LAUDOS_REPOSITORY');

/** Laudos que um arquivo cobre: a origem, os dias do laudo e, no compartilhamento, as empresas. */
export interface JanelaLaudos {
  origem: OrigemLaudo;
  /** "YYYY-MM-DD", dias do laudo em horário de Brasília. */
  inicio: string;
  fim: string;
  /** Só no compartilhamento: o envio de uma unidade não mexe nos laudos das outras empresas. */
  empresas?: string[];
  /** Laudos dessas competências não mudam. */
  competenciasBloqueadas: string[];
}

export interface AlteracoesLaudos {
  inserir: LaudoPreparado[];
  atualizar: LaudoPreparado[];
  remover: string[];
  /** Linha crua da planilha de cada laudo inserido ou atualizado, por identidade. */
  linhasBrutas: ReadonlyMap<string, Record<string, Celula>>;
}

export interface LaudosRepository {
  existentesNaJanela(janela: JanelaLaudos): Promise<Map<string, LaudoExistente>>;
  /**
   * Grava tudo numa transação: upsert dos laudos (com peças e linha crua), marca os removidos e
   * recalcula os totais dos dias da janela.
   */
  aplicar(
    importacaoId: string,
    janela: JanelaLaudos,
    alteracoes: AlteracoesLaudos,
    agora: Date,
  ): Promise<void>;
}
