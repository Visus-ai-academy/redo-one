import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import type { TipoAviso } from '../../domain/preparar-laudo';

export const CONSULTA_AVISOS = Symbol('CONSULTA_AVISOS');

export type StatusAviso = 'pendente' | 'resolvido' | 'ignorado';

export interface AvisoCadastro {
  id: string;
  tipo: TipoAviso;
  /** Como chegou da MobileMed na última importação. */
  valor: string;
  status: StatusAviso;
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
}

export interface ConsultaAvisos {
  /** O visto por último primeiro; com busca, a grafia mais parecida na frente. */
  listar(filtro: FiltroAvisos): Promise<Pagina<AvisoCadastro>>;
  obter(id: string): Promise<AvisoCadastro | null>;
  decidir(
    id: string,
    decisao: { status: StatusAviso; decididoPorId: string; motivo: string | null; em: Date },
  ): Promise<void>;
}
