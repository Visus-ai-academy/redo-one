import type { OutraContaMobilemed } from '../cadastro/medicos.repository';

export const OUTRAS_CONTAS_MEDICO_REPOSITORY = Symbol('OUTRAS_CONTAS_MEDICO_REPOSITORY');

export interface NovaOutraConta {
  idMobilemed: number;
  observacao: string | null;
}

export interface OutrasContasMedicoRepository {
  criarOutraConta(medicoId: string, conta: NovaOutraConta): Promise<string>;
  buscarOutraContaDoMedico(medicoId: string, contaId: string): Promise<OutraContaMobilemed | null>;
  excluirOutraConta(contaId: string): Promise<void>;
}
