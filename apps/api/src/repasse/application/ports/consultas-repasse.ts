export const CONSULTAS_REPASSE = Symbol('CONSULTAS_REPASSE');

export interface PaginaRepasse<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Somas de uma geração (ou do recorte filtrado dela). Dinheiro em centavos. */
export interface TotaisRepasse {
  medicos: number;
  volume: number;
  examesCentavos: number;
  adicionaisCentavos: number;
  brutoCentavos: number;
  retencoesCentavos: number;
  liquidoCentavos: number;
  /** Grupos (médico × arranjo × cliente) sem preço. */
  gruposSemPreco: number;
  /** Laudos (ou peças da quebra) desses grupos, pagos a zero. */
  laudosSemPreco: number;
}

export const TOTAIS_ZERADOS: TotaisRepasse = {
  medicos: 0,
  volume: 0,
  examesCentavos: 0,
  adicionaisCentavos: 0,
  brutoCentavos: 0,
  retencoesCentavos: 0,
  liquidoCentavos: 0,
  gruposSemPreco: 0,
  laudosSemPreco: 0,
};

export interface PedidoRecalculoLido {
  motivo: string;
  solicitadoPor: string | null;
  solicitadoEm: Date;
}

export interface GeracaoLida {
  id: string;
  tipo: 'previa' | 'recalculo';
  atual: boolean;
  geradoEm: Date;
  /** O pedido com motivo que gerou esta versão (só no recálculo). */
  recalculo: PedidoRecalculoLido | null;
  totais: TotaisRepasse;
}

export interface CompetenciaLida {
  competencia: string;
  status: 'aberta' | 'fechada';
  fechadaEm: Date | null;
  /** Nome de quem fechou (ou o nome que veio do dashboards-one). */
  fechadaPor: string | null;
  reabertaEm: Date | null;
  /** Todas as gerações guardadas, a mais antiga primeiro. */
  geracoes: GeracaoLida[];
  /** Recálculo do repasse pedido e ainda não concluído. */
  recalculoPendente: PedidoRecalculoLido | null;
}

export interface DemonstrativoResumo {
  id: string;
  medicoId: string;
  medico: string;
  volume: number;
  examesCentavos: number;
  adicionaisCentavos: number;
  brutoCentavos: number;
  retencoesCentavos: number;
  liquidoCentavos: number;
  gruposSemPreco: number;
}

export const ORDENS_DEMONSTRATIVO = [
  'medico',
  'volume',
  'exames',
  'adicionais',
  'bruto',
  'retencoes',
  'liquido',
  'semPreco',
] as const;
export type OrdemDemonstrativo = (typeof ORDENS_DEMONSTRATIVO)[number];

export const SITUACOES_DEMONSTRATIVO = ['todas', 'sem_preco', 'com_preco'] as const;
export type SituacaoDemonstrativo = (typeof SITUACOES_DEMONSTRATIVO)[number];

export interface FiltroDemonstrativos {
  geracaoId: string;
  busca?: string;
  situacao: SituacaoDemonstrativo;
  ordem: OrdemDemonstrativo;
  direcao: 'asc' | 'desc';
  pagina: number;
  porPagina: number;
}

export type OrigemPrecoLida = 'unidade' | 'cliente' | 'todos' | 'tarifa_propria' | 'sem_preco';

/** Grupo de laudos (arranjo × cliente) com os nomes resolvidos e de onde veio o preço. */
export interface GrupoLido {
  id: string;
  modalidade: string | null;
  especialidade: string | null;
  categoria: string | null;
  prioridade: string | null;
  cliente: string | null;
  unidade: string | null;
  volume: number;
  unitarioCentavos: number | null;
  totalCentavos: number;
  origem: OrigemPrecoLida;
  /** A categoria do preço quando veio por uma alternativa (ex.: COLUNAS pago como SC). */
  categoriaPreco: string | null;
}

/** Adicional, regra de apuração ou retenção: a memória de cálculo e o valor. */
export interface LancamentoLido {
  id: string;
  tipo: 'adicional' | 'regra' | 'retencao';
  descricao: string;
  totalCentavos: number;
}

export interface DiaLido {
  dia: string;
  volume: number;
  totalCentavos: number;
}

export interface DemonstrativoLido extends DemonstrativoResumo {
  competencia: string;
  geracaoId: string;
  contratado: string | null;
  grupos: GrupoLido[];
  lancamentos: LancamentoLido[];
  dias: DiaLido[];
}

/** Laudo pago no demonstrativo, sem o paciente (ele vem pela leitura auditada). */
export interface LaudoDoDemonstrativo {
  laudoId: string;
  peca: number;
  dataLaudo: Date;
  exame: string | null;
  cliente: string | null;
  volume: number;
  totalCentavos: number;
}

export interface CompetenciaComRepasse {
  competencia: string;
  status: 'aberta' | 'fechada';
}

/** Leituras das telas do repasse (gerações, demonstrativos, laudos pagos). */
export interface ConsultasRepasse {
  /** Competências com repasse gerado, a mais recente primeiro. */
  competencias(): Promise<CompetenciaComRepasse[]>;
  competencia(competencia: string): Promise<CompetenciaLida>;
  demonstrativos(
    filtro: FiltroDemonstrativos,
  ): Promise<PaginaRepasse<DemonstrativoResumo> & { totais: TotaisRepasse }>;
  demonstrativo(id: string): Promise<DemonstrativoLido | null>;
  laudos(
    demonstrativoId: string,
    pagina: number,
    porPagina: number,
  ): Promise<PaginaRepasse<LaudoDoDemonstrativo>>;
  /** Médicos ativos para o lançamento e o filtro dos adicionais (o mais parecido primeiro). */
  medicos(busca: string | undefined, limite: number): Promise<{ id: string; nome: string }[]>;
}
