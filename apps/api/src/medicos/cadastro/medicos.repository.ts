import type { Pagina, Paginacao } from '../../catalogo/comum/paginacao';

export const MEDICOS_REPOSITORY = Symbol('MEDICOS_REPOSITORY');

export type FuncaoMedico = 'STAFF' | 'FELLOW';

/** Cadastro do médico (o que é do contexto `medicos`; pagamento fica à parte). */
export interface DadosMedico {
  nome: string;
  crm: string | null;
  /** Id da conta na MobileMed. */
  idMobilemed: number | null;
  /** Em minúsculas. */
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  ocultoDashboards: boolean;
  senior: boolean;
  fellowship: boolean;
  funcao: FuncaoMedico | null;
  nivelId: string | null;
  /** `AAAA-MM-DD`. */
  dataInicioVinculo: string | null;
  observacoes: string | null;
}

export interface AliasMedico {
  id: string;
  nomeOrigem: string;
  origem: 'manual' | 'volumetria' | 'repasse' | 'repasse_upload';
  verificadoManualmente: boolean;
  observacoes: string | null;
}

export interface Referencia {
  id: string;
  nome: string;
}

/** Outra conta do médico na MobileMed, além da principal (`idMobilemed`). */
export interface OutraContaMobilemed {
  id: string;
  idMobilemed: number;
  observacao: string | null;
  criadoEm: Date;
}

/** Quem tem a conta: como principal (`medicos.id_mobilemed`) ou como outra conta. */
export interface DonoDaConta extends Referencia {
  principal: boolean;
}

export interface MedicoResumo {
  id: string;
  nome: string;
  crm: string | null;
  idMobilemed: number | null;
  nivel: Referencia | null;
  funcao: FuncaoMedico | null;
  senior: boolean;
  ativo: boolean;
  ocultoDashboards: boolean;
  totalAliases: number;
}

export interface MedicoDetalhe extends Omit<DadosMedico, 'nivelId'> {
  id: string;
  nivel: Referencia | null;
  aliases: AliasMedico[];
  /** Outras contas na MobileMed (a principal é `idMobilemed`). */
  outrasContas: OutraContaMobilemed[];
  equipes: Referencia[];
}

export interface FiltroMedicos extends Paginacao {
  /** Parte do nome, o CRM ou o id na MobileMed. */
  busca?: string;
  ativo?: boolean;
  nivelId?: string;
  equipeId?: string;
}

export interface MedicosRepository {
  listar(filtro: FiltroMedicos): Promise<Pagina<MedicoResumo>>;
  buscar(id: string): Promise<MedicoDetalhe | null>;
  /** Médico cujo nome normalizado é essa chave. */
  buscarPorChave(chaveNormalizada: string): Promise<Referencia | null>;
  /** O médico que tem a conta, como principal ou como outra conta. */
  buscarPorIdMobilemed(idMobilemed: number): Promise<DonoDaConta | null>;
  criar(dados: DadosMedico & { chaveNormalizada: string }): Promise<string>;
  atualizar(id: string, dados: DadosMedico & { chaveNormalizada: string }): Promise<void>;
  /** `false` quando outro cadastro referencia o médico. Apelidos, pagamento e equipes saem junto. */
  excluir(id: string): Promise<boolean>;
}
