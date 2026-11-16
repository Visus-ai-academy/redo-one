import { ErroDeDominio } from '../../comum/erro-de-dominio';

/** Dado da escala fora da regra (horário, período, dias, produtividade...). */
export class EscalaInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

/** A operação bate com outro registro da escala (ex.: duas coberturas no mesmo plantão). */
export class ConflitoEscalaError extends ErroDeDominio {
  readonly tipo = 'conflito';
}

/** A pessoa não pode fazer isso (ex.: médico pedindo um tipo de ausência que só o gestor lança). */
export class AcaoProibidaEscalaError extends ErroDeDominio {
  readonly tipo = 'proibido';
}

/** O registro não existe para quem pediu (ex.: médico cancelando a solicitação de outro). */
export class RegistroEscalaNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
}
