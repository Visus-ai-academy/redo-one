import type { Tipificacao } from '../../../faturamento/domain/tipificacao';
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
  /**
   * Tipificação de cada laudo da janela, por identidade, inclusive dos que não mudaram (a
   * configuração nova chega a eles na importação seguinte). Só grava a que mudou, e só no laudo
   * gravado com a mesma competência da linha lida (o que a gravação pulou não ganha tipificação
   * de dados que não foram gravados).
   */
  classificacoes: ReadonlyMap<string, Tipificacao & { competencia: string }>;
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

/** O que a reclassificação da tipificação lê de cada laudo, com a tipificação gravada. */
export interface LaudoParaReclassificacao {
  id: string;
  empresaOrigem: string;
  clienteId: string | null;
  unidadeId: string | null;
  modalidadeId: string | null;
  especialidadeId: string | null;
  prioridadeId: string | null;
  medicoId: string | null;
  competencia: string;
  /** Nula se o laudo ainda não foi tipificado. */
  tipificacao: Tipificacao | null;
}

export interface ReclassificacaoLaudo {
  id: string;
  unidadeId: string | null;
  tipificacao: Tipificacao;
}

/** Cliente (o principal) e unidade de origem resolvidos de novo para um laudo. */
export interface ClienteDoLaudo {
  id: string;
  clienteId: string | null;
  unidadeId: string | null;
}

export interface LaudosRepository {
  existentesNaJanela(janela: JanelaLaudos): Promise<Map<string, LaudoExistente>>;
  /**
   * Grava tudo numa transação: upsert dos laudos (com peças e linha crua), upsert dos pacientes, ids da conta MobileMed dos laudos iguais,
   * marca os removidos e refaz os totais só dos dias afetados (o dia novo e o antigo de cada
   * laudo gravado ou removido).
   */
  aplicar(
    importacaoId: string,
    janela: JanelaLaudos,
    alteracoes: AlteracoesLaudos,
    agora: Date,
  ): Promise<void>;
  /** Quais dessas identidades já têm laudo gravado (removido inclusive), em qualquer competência. */
  identidadesGravadas(identidades: string[]): Promise<Set<string>>;
  /**
   * Só insere, numa transação: o laudo cuja identidade já existe fica como está, em qualquer
   * competência (aberta, fechada ou travada). Dos inseridos, grava peças, linha crua, paciente e
   * tipificação, e refaz os totais dos dias deles. Devolve quantos entraram.
   */
  inserirNovos(
    importacaoId: string,
    novos: Pick<AlteracoesLaudos, 'inserir' | 'linhasBrutas' | 'pacientes' | 'classificacoes'>,
    agora: Date,
  ): Promise<number>;
  /** Lote de laudos para recalcular a competência, removidos inclusive. */
  lerParaRecalculo(lote: LoteRecalculo): Promise<LaudoParaRecalculo[]>;
  /** Lote de laudos para reclassificar a tipificação, removidos inclusive. */
  lerParaReclassificacao(lote: LoteRecalculo): Promise<LaudoParaReclassificacao[]>;
  /** Grava a unidade de origem e a tipificação dos laudos (só a dos que não estão bloqueados). */
  gravarReclassificacao(
    mudancas: ReclassificacaoLaudo[],
    competenciasBloqueadas: string[],
    agora: Date,
  ): Promise<void>;
  /**
   * Grava o cliente e a unidade dos laudos (só dos que não estão bloqueados), numa transação que
   * refaz os totais dos dias dos laudos que mudaram de cliente e enfileira o recálculo da
   * competência e a reclassificação da tipificação deles.
   */
  gravarClientes(
    mudancas: ClienteDoLaudo[],
    competenciasBloqueadas: string[],
    agora: Date,
  ): Promise<void>;
  /** Grava só a competência (e `atualizado_em`) dos laudos. */
  atualizarCompetencias(
    mudancas: { id: string; competencia: string }[],
    agora: Date,
  ): Promise<void>;
}
