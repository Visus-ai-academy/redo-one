import type { Pagina, Paginacao } from '../../catalogo/comum/paginacao';
import type { EntidadeEscala } from '../auditoria-escala';
import type { EscopoEscala } from '../escopo/escopo';

export const HISTORICO_ESCALA_REPOSITORY = Symbol('HISTORICO_ESCALA_REPOSITORY');

export interface FiltroHistoricoEscala extends Paginacao {
  medicoId?: string;
  entidade?: EntidadeEscala;
  /** Inclusivo. */
  de?: Date;
  ateExclusivo?: Date;
  /** Recorte de quem consulta; `null` = vê tudo. */
  escopo: EscopoEscala | null;
}

export interface ItemHistoricoEscala {
  id: string;
  ocorridoEm: Date;
  ator: {
    tipo: 'usuario' | 'robo' | 'sistema';
    /** Usuário (ou robô) que fez; na carga do legado, o `usuarioLegado` gravado no evento. */
    nome: string | null;
  };
  entidade: string;
  entidadeId: string;
  acao: string;
  medico: { id: string; nome: string } | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
}

/** Página do histórico com o nome de cada id citado em `antes`/`depois` dos itens dela. */
export interface PaginaHistoricoEscala extends Pagina<ItemHistoricoEscala> {
  /** Id → nome legível. Id sem par (registro apagado ou de outra tabela) fica de fora. */
  nomes: Record<string, string>;
}

export interface HistoricoEscalaRepository {
  /** Do mais novo para o mais antigo. */
  listar(filtro: FiltroHistoricoEscala): Promise<PaginaHistoricoEscala>;
}
