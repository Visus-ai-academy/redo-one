import type { AliasMedico } from '../cadastro/medicos.repository';

export const ALIASES_MEDICO_REPOSITORY = Symbol('ALIASES_MEDICO_REPOSITORY');

export interface NovoAliasMedico {
  nomeOrigem: string;
  chaveNormalizada: string;
  observacoes: string | null;
}

export interface AliasesMedicoRepository {
  /** Apelido com essa chave, de qualquer médico. */
  buscarAlias(
    chaveNormalizada: string,
  ): Promise<{ id: string; medicoId: string; medicoNome: string } | null>;
  /** Criado à mão, já conferido (`origem` manual). */
  criarAlias(medicoId: string, alias: NovoAliasMedico): Promise<string>;
  buscarAliasDoMedico(medicoId: string, aliasId: string): Promise<AliasMedico | null>;
  excluirAlias(aliasId: string): Promise<void>;
}
