import { ErroDeDominio } from '../../comum/erro-de-dominio';

/**
 * Um ou mais campos inválidos. `detalhes.campos` diz qual e por quê, para a tela pôr o erro no
 * campo; a mensagem geral é a do primeiro.
 */
export class DadosInvalidosError extends ErroDeDominio {
  readonly tipo = 'invalido';
  declare readonly detalhes: { campos: Record<string, string> };

  constructor(campos: Record<string, string>) {
    super(Object.values(campos)[0] ?? 'Dados inválidos.', { campos });
  }
}

/** O valor de um campo já é de outro cadastro (nome, CNPJ, CPF); `detalhes.campos` diz qual. */
export class DadoEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';
  declare readonly detalhes: { campos: Record<string, string> };

  constructor(campo: string, mensagem: string) {
    super(mensagem, { campos: { [campo]: mensagem } });
  }
}

export class NaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
}

/** O item é referenciado por outro cadastro: excluir deixaria o outro sem par. */
export class EmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';
}

/** Lança `DadosInvalidosError` se houver algum campo com erro. */
export function exigirSemErros(erros: Record<string, string>) {
  if (Object.keys(erros).length) throw new DadosInvalidosError(erros);
}

/** Texto aparado; vazio vira `null`. */
export const aparar = (valor: string | null | undefined): string | null => valor?.trim() || null;
