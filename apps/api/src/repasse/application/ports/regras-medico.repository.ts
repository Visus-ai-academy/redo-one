import type { EventoAuditoria } from '../../../auditoria/auditoria';
import type { MudancaVersao, Versionada } from '../../domain/versoes';

export const REGRAS_MEDICO_REPOSITORY = Symbol('REGRAS_MEDICO_REPOSITORY');

/** Como os laudos do médico contam no repasse. */
export type ModoContagem = 'todos_os_laudos' | 'recortes' | 'somente_adicionais';

/** Recorte cliente × especialidade; nulo = todos os clientes / todas as especialidades. */
export interface RecorteContagem {
  clienteId: string | null;
  especialidadeId: string | null;
}

export interface Autoria {
  criadoEm: Date | null;
  criadoPor: string | null;
}

export interface VersaoContagem extends Versionada, Autoria {
  modo: ModoContagem;
  recortes: (RecorteContagem & { cliente: string | null; especialidade: string | null })[];
}

export type TipoRegraApuracao = 'fixo' | 'por_laudo' | 'percentual_repasse' | 'tarifa_laudo';

export interface DadosRegraApuracao {
  tipo: TipoRegraApuracao;
  descricao: string;
  valorCentavos: number | null;
  percentualPpm: number | null;
  divisor: number;
  /** Nulo = todas. */
  modalidadeIds: string[] | null;
  especialidadeIds: string[] | null;
  prioridadeIds: string[] | null;
}

export interface RegraApuracaoGravada extends DadosRegraApuracao, Versionada, Autoria {
  nomes: { modalidades: string[]; especialidades: string[]; prioridades: string[] };
}

export interface EventoDaVersao {
  acao: string;
  quem: string | null;
  em: Date;
}

export interface Gravacao<D> {
  medicoId: string;
  usuarioId: string;
  /** Primeira competência alcançada (conferida de novo dentro da transação). */
  aPartirDe: string;
  mudancas: MudancaVersao[];
  /** A versão nova, com o id já escolhido (para a auditoria). */
  nova: (D & { id: string; vigenciaDesde: string; vigenciaAte: string | null }) | null;
  eventos: EventoAuditoria[];
}

/** Lista geral das regras (todos os médicos); sem `tipo`, todos os tipos (a tela diz "Todos"). */
export interface FiltroRegrasGeral {
  busca?: string;
  tipo?: TipoRegraApuracao;
  /** As encerradas antes dele ficam de fora. */
  mesAtual: string;
  pagina: number;
  porPagina: number;
}

export interface PaginaRegrasGeral {
  itens: (RegraApuracaoGravada & { medicoId: string; medico: string })[];
  total: number;
}

/** Configuração de contagem (`configuracoes_medico_repasse`) e regras de apuração do médico. */
export interface RegrasMedicoRepository {
  nomeDoMedico(medicoId: string): Promise<string | null>;
  bloqueadas(): Promise<string[]>;
  listarContagem(medicoId: string): Promise<VersaoContagem[]>;
  listarRegras(medicoId: string): Promise<RegraApuracaoGravada[]>;
  /** Todas as regras que valem ou vão valer, de todos os médicos, paginadas. */
  listarTodasRegras(filtro: FiltroRegrasGeral): Promise<PaginaRegrasGeral>;
  /**
   * Numa transação: confere a competência, aplica as mudanças (conferindo o `vigencia_ate` lido),
   * cria a versão nova, grava os eventos e pede as prévias. Se algo falha, nada é gravado.
   */
  gravarContagem(g: Gravacao<{ modo: ModoContagem; recortes: RecorteContagem[] }>): Promise<void>;
  gravarRegra(g: Gravacao<DadosRegraApuracao>): Promise<void>;
  /** Eventos de auditoria por versão, do mais antigo ao mais novo. */
  eventos(entidade: string, ids: string[]): Promise<Map<string, EventoDaVersao[]>>;
}
