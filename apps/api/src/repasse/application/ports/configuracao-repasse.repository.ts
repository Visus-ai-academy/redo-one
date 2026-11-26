export const CONFIGURACAO_REPASSE = Symbol('CONFIGURACAO_REPASSE');

/** Versão dos parâmetros do repasse (vale de `vigenciaDesde` até a próxima). */
export interface ParametrosRepasse {
  id: string;
  vigenciaDesde: string;
  tarifaPeerReviewCentavos: number;
  tarifaPlantaoCentavos: number;
  contratadoRegistroId: string | null;
  pagaDuplicados: boolean;
  diaVencimento: number;
  diaCorteAntecipacao: number;
  categoriaFinanceiraSocio: string;
  categoriaFinanceiraNaoSocio: string;
  faixasListaAtraso: { exames: number; valorCentavos: number }[];
  criadoEm: Date;
}

export type DadosParametros = Omit<ParametrosRepasse, 'id' | 'vigenciaDesde' | 'criadoEm'>;

/** Reclassificação do laudo para o repasse; `null` num recorte = todos. */
export interface Reclassificacao {
  id: string;
  ordem: number;
  descricao: string;
  modalidadeIds: string[] | null;
  especialidadeIds: string[] | null;
  categoriaIds: string[] | null;
  equipeIds: string[] | null;
  especialidadeDestinoId: string | null;
  categoriaDestinoId: string | null;
  vigenciaDesde: string | null;
  vigenciaAte: string | null;
}

export interface AlternativaPrecoRepasse {
  id: string;
  ordem: number;
  /** `null` = todas. */
  especialidadeId: string | null;
  semCategoria: boolean;
  categoriaOrigemId: string | null;
  categoriaDestinoId: string;
  vigenciaDesde: string | null;
  vigenciaAte: string | null;
}

/** Parâmetros, reclassificações e alternativas: só se cria versão nova ou se encerra a vigente. */
export interface ConfiguracaoRepasseRepository {
  /** Fechadas ou travadas: a vigência nova começa depois delas. */
  bloqueadas(): Promise<string[]>;
  listarParametros(): Promise<ParametrosRepasse[]>;
  criarParametros(desde: string, dados: DadosParametros, por: string, em: Date): Promise<string>;
  contratadoExiste(id: string): Promise<boolean>;

  listarReclassificacoes(): Promise<Reclassificacao[]>;
  criarReclassificacao(
    r: Omit<Reclassificacao, 'id' | 'vigenciaAte'> & { vigenciaDesde: string },
    por: string,
    em: Date,
  ): Promise<string>;
  encerrarReclassificacao(id: string, ate: string): Promise<boolean>;

  listarAlternativas(): Promise<AlternativaPrecoRepasse[]>;
  criarAlternativa(
    a: Omit<AlternativaPrecoRepasse, 'id' | 'vigenciaAte'> & { vigenciaDesde: string },
    por: string,
    em: Date,
  ): Promise<string>;
  encerrarAlternativa(id: string, ate: string): Promise<boolean>;
}
