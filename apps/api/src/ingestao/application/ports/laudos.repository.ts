import type { Celula } from '../../domain/celulas';
import type { LaudoExistente } from '../../domain/planejar-importacao';
import type { LaudoPreparado, OrigemLaudo, PacienteDoLaudo } from '../../domain/preparar-laudo';

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
  /**
   * Paciente (nome e código) a gravar em `laudos_pacientes`, por identidade: do laudo novo, do
   * que não o tinha e do que mudou, inclusive de laudos sem outra mudança.
   */
  pacientes: ReadonlyMap<string, PacienteDoLaudo>;
  /**
   * Id da conta MobileMed de quem assinou e reassinou a gravar em laudos sem outra mudança, por
   * identidade; nulo mantém o gravado.
   */
  idsMedico: ReadonlyMap<string, IdsMedicoMobilemed>;
}

export interface IdsMedicoMobilemed {
  medicoIdMobilemed: number | null;
  medicoReassinaturaIdMobilemed: number | null;
}

/** O que o recálculo da competência lê de cada laudo. */
export interface LaudoParaRecalculo {
  id: string;
  clienteId: string | null;
  dataRealizacao: Date;
  dataLaudo: Date;
  competencia: string;
}

/** Um lote do recálculo, em ordem de id, a partir do cursor. */
export interface LoteRecalculo {
  /** Nulo = todos os clientes (inclusive os laudos sem cliente). */
  clienteIds: string[] | null;
  /** Laudos dessas competências ficam de fora. */
  competenciasBloqueadas: string[];
  /** Id do último laudo do lote anterior; nulo no primeiro lote. */
  depoisDe: string | null;
  limite: number;
}

export interface LaudosRepository {
  existentesNaJanela(janela: JanelaLaudos): Promise<Map<string, LaudoExistente>>;
  /**
   * Grava tudo numa transação: upsert dos laudos (com peças e linha crua), upsert dos pacientes, ids da conta MobileMed dos laudos iguais,
   * marca os removidos e recalcula os totais dos dias da janela.
   */
  aplicar(
    importacaoId: string,
    janela: JanelaLaudos,
    alteracoes: AlteracoesLaudos,
    agora: Date,
  ): Promise<void>;
  /** Lote de laudos para recalcular a competência, removidos inclusive. */
  lerParaRecalculo(lote: LoteRecalculo): Promise<LaudoParaRecalculo[]>;
  /** Grava só a competência (e `atualizado_em`) dos laudos. */
  atualizarCompetencias(
    mudancas: { id: string; competencia: string }[],
    agora: Date,
  ): Promise<void>;
}
