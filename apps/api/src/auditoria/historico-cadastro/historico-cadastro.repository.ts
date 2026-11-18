import type { Pagina, Paginacao } from '../../catalogo/comum/paginacao';

export const HISTORICO_CADASTRO_REPOSITORY = Symbol('HISTORICO_CADASTRO_REPOSITORY');

/**
 * De que cadastro é o histórico. No médico, cada parte com permissão própria só entra quando quem
 * consulta pode vê-la (`medicos.pagamento.ver`, `medicos.distribuicao.ver`, `medicos.acesso.ver`).
 */
export type AlvoHistorico =
  | {
      cadastro: 'medico';
      id: string;
      incluir: { pagamento: boolean; distribuicao: boolean; acesso: boolean };
    }
  | { cadastro: 'cliente'; id: string }
  | { cadastro: 'exame'; id: string };

export interface ItemHistoricoCadastro {
  id: string;
  ocorridoEm: Date;
  ator: { tipo: 'usuario' | 'robo' | 'sistema'; nome: string | null };
  /** `medico`, `medico_distribuicao`, `arranjos_medico`, `usuario`, `equipe` (no médico: `membro_entrou`, `membro_saiu`, `equipe_excluida`), `cliente`, `exame`, `de_para_valor_exame`. */
  entidade: string;
  entidadeId: string;
  acao: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
}

/** Página do histórico com o nome de cada id citado nos itens dela. */
export interface PaginaHistoricoCadastro extends Pagina<ItemHistoricoCadastro> {
  /** Id → nome legível. Id sem par (registro apagado) fica de fora. */
  nomes: Record<string, string>;
}

export interface HistoricoCadastroRepository {
  /** Do mais novo para o mais antigo. */
  listar(alvo: AlvoHistorico, paginacao: Paginacao): Promise<PaginaHistoricoCadastro>;
}
