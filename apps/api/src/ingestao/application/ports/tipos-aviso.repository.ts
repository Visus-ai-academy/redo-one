import type { TipoAviso } from '../../domain/preparar-laudo';

export const TIPOS_AVISO_REPOSITORY = Symbol('TIPOS_AVISO_REPOSITORY');

export interface ConfiguracaoTipoAviso {
  tipo: TipoAviso;
  /** O aviso pendente desse tipo, ligado a uma competência, impede fechá-la. */
  impedeFecharCompetencia: boolean;
  /** Papéis cujos usuários veem os avisos desse tipo na faixa do topo. */
  responsaveis: { id: string; nome: string }[];
  /** Pendentes agora (para a tela de configuração). */
  pendentes: number;
}

/** Tabelas `tipos_aviso` e `tipos_aviso_responsaveis`. */
export interface TiposAvisoRepository {
  /** Todos os tipos com linha na tabela, na ordem de `TIPOS_AVISO`. */
  listar(): Promise<ConfiguracaoTipoAviso[]>;
  obter(tipo: TipoAviso): Promise<ConfiguracaoTipoAviso | null>;
  /** Troca a configuração do tipo (os responsáveis passam a ser exatamente estes). */
  salvar(
    tipo: TipoAviso,
    dados: { impedeFecharCompetencia: boolean; papeisIds: readonly string[]; em: Date },
  ): Promise<void>;
  /** Os tipos de que algum destes papéis é responsável. */
  tiposDosPapeis(papeisIds: readonly string[]): Promise<TipoAviso[]>;
  /** Os papéis que se pode escolher como responsáveis (todos, por nome). */
  papeis(): Promise<{ id: string; nome: string }[]>;
  /** Ids que não são papéis (para recusar a configuração). */
  papeisInexistentes(ids: readonly string[]): Promise<string[]>;
}
