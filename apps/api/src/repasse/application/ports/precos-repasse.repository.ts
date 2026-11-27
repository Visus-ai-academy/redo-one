import type { EventoAuditoria } from '../../../auditoria/auditoria';
import type {
  ArranjoPreco,
  MudancaPrecoRepasse,
  VersaoPrecoRepasse,
} from '../../domain/versoes-preco';

export const PRECOS_REPASSE_REPOSITORY = Symbol('PRECOS_REPASSE_REPOSITORY');

/** A versão com os nomes do arranjo e do cliente (nulo = todos os clientes). */
export interface VersaoPrecoComNomes extends VersaoPrecoRepasse {
  nomes: {
    modalidade: string;
    especialidade: string;
    categoria: string;
    prioridade: string;
    cliente: string | null;
  };
}

export interface OpcaoPrecoRepasse {
  id: string;
  nome: string;
}

/** Cadastros ativos para o editor e a planilha. */
export interface OpcoesPrecoRepasse {
  modalidades: OpcaoPrecoRepasse[];
  especialidades: OpcaoPrecoRepasse[];
  categorias: OpcaoPrecoRepasse[];
  prioridades: OpcaoPrecoRepasse[];
  clientes: OpcaoPrecoRepasse[];
  /** Equipes de médicos (recorte das reclassificações). */
  equipes: OpcaoPrecoRepasse[];
  /** Contratados (o do registro do repasse), pela razão social. */
  contratados: OpcaoPrecoRepasse[];
}

export interface EventoVersaoPreco {
  acao: string;
  quem: string | null;
  em: Date;
}

export type MudancaPrecoGravada =
  | Exclude<MudancaPrecoRepasse, { tipo: 'criar' }>
  | (Extract<MudancaPrecoRepasse, { tipo: 'criar' }> & { id: string });

/** Tabela `precos_repasse`, por médico. */
export interface PrecosRepasseRepository {
  /** Nome do médico; nulo se não existe. */
  nomeDoMedico(medicoId: string): Promise<string | null>;
  /** Fechadas ou travadas: a vigência nova começa depois delas. */
  bloqueadas(): Promise<string[]>;
  listarVersoes(medicoId: string, arranjo?: ArranjoPreco): Promise<VersaoPrecoComNomes[]>;
  /**
   * Grava as mudanças, os eventos e o pedido das prévias numa transação, com o médico travado.
   * Confere de novo a competência, o `vigencia_ate` lido e que nada se cruza; se algo falha, nada
   * é gravado. A versão mexida tem o aviso de preço repetido resolvido.
   */
  aplicar(
    medicoId: string,
    mudancas: MudancaPrecoGravada[],
    opcoes: { usuarioId: string; aPartirDe: string; eventos: EventoAuditoria[] },
  ): Promise<void>;
  opcoes(): Promise<OpcoesPrecoRepasse>;
  /** Eventos de auditoria das versões, do mais antigo ao mais novo. */
  eventos(ids: string[]): Promise<Map<string, EventoVersaoPreco[]>>;
}
