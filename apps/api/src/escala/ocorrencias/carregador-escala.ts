import type {
  AjusteProdutividade,
  AlocacaoEscala,
  AusenciaEscala,
  Data,
  FrenteEscala,
  TipoAusencia,
  TurnoEscala,
} from '../domain';

export const CARREGADOR_ESCALA = Symbol('CARREGADOR_ESCALA');

export interface TurnoCarregado extends TurnoEscala {
  nome: string;
  cor: string | null;
  ordem: number;
}

export interface FrenteCarregada extends FrenteEscala {
  rotulo: string;
  cor: string | null;
  ordem: number;
}

export interface MedicoCarregado {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface TipoAusenciaCarregado extends TipoAusencia {
  nome: string;
  cor: string | null;
}

/** Tudo que a expansão da escala precisa para uma janela, com os nomes para a tela. */
export interface DadosEscala {
  /** As que tocam a janela e, para cada cobertura, o titular dela. */
  alocacoes: AlocacaoEscala[];
  turnos: TurnoCarregado[];
  frentes: FrenteCarregada[];
  /** Os médicos das alocações carregadas (ativos ou não: o nome do titular coberto aparece). */
  medicos: MedicoCarregado[];
  /** Só as aprovadas que tocam a janela. */
  ausencias: AusenciaEscala[];
  tiposAusencia: TipoAusenciaCarregado[];
  /** Os ajustes de produtividade dos dias da janela. */
  ajustes: AjusteProdutividade[];
}

export interface CarregadorEscala {
  carregar(de: Data, ate: Data): Promise<DadosEscala>;
}
