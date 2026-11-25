import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import type {
  CompetenciasAviso,
  EntidadeAviso,
  OrigemAviso,
} from '../../../comum/avisos/registro-avisos';
import type { TipoAviso } from '../../domain/preparar-laudo';

export const CONSULTA_AVISOS = Symbol('CONSULTA_AVISOS');

export type StatusAviso = 'pendente' | 'resolvido' | 'ignorado';

export interface AvisoCadastro {
  id: string;
  tipo: TipoAviso;
  /** Como chegou na última verificação. */
  valor: string;
  status: StatusAviso;
  origem: OrigemAviso;
  /** Competências a que se liga (trava do fechamento); nulo se nenhuma. */
  competencias: CompetenciasAviso | null;
  /** Itens do cadastro a que se refere (selo e atalho). */
  entidades: EntidadeAviso[];
  ocorrencias: number;
  primeiraVezEm: Date;
  ultimaVezEm: Date;
  decididoPor: { id: string; nome: string } | null;
  decididoEm: Date | null;
  motivo: string | null;
}

export interface FiltroAvisos extends Paginacao {
  status?: StatusAviso;
  /** Só estes tipos (os que quem consulta vê, já estreitados pelo filtro); vazia, nenhum. */
  tipos: readonly TipoAviso[];
  busca?: string;
  /** Só os ligados a esta competência "AAAA-MM". */
  competencia?: string;
  /** Só os que se referem a este item. */
  entidade?: EntidadeAviso;
}

/** Aviso pendente ligado a um item, para o selo dele. */
export interface AvisoDaEntidade {
  entidadeId: string;
  id: string;
  tipo: TipoAviso;
  valor: string;
}

export interface ConsultaAvisos {
  /** O visto por último primeiro; com busca, a grafia mais parecida na frente. */
  listar(filtro: FiltroAvisos): Promise<Pagina<AvisoCadastro>>;
  obter(id: string): Promise<AvisoCadastro | null>;
  decidir(
    id: string,
    decisao: { status: StatusAviso; decididoPorId: string; motivo: string | null; em: Date },
  ): Promise<void>;
  /** Pendentes desses tipos: quantos e desde quando o mais antigo (a faixa do responsável). */
  resumoPendentes(
    tipos: readonly TipoAviso[],
  ): Promise<{ total: number; maisAntigoEm: Date | null }>;
  /** Pendentes desses tipos ligados a estes itens (uma consulta para a página inteira). */
  pendentesDasEntidades(
    entidade: string,
    ids: readonly string[],
    tipos: readonly TipoAviso[],
  ): Promise<AvisoDaEntidade[]>;
}
