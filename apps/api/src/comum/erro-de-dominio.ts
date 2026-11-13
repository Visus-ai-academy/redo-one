/** O que deu errado, em termos de negócio. O filtro global traduz para o status HTTP. */
export type TipoErro = 'nao_encontrado' | 'conflito' | 'invalido' | 'proibido';

/**
 * Base dos erros de regra de negócio. A mensagem vai para a pessoa, então é escrita para ela
 * (diz o problema e como resolver) e nunca leva dado sensível.
 */
export abstract class ErroDeDominio extends Error {
  abstract readonly tipo: TipoErro;

  constructor(
    mensagem: string,
    /** Campos extras na resposta (ex.: `totalUsuarios`), para a tela montar a mensagem. */
    readonly detalhes: Record<string, unknown> = {},
  ) {
    super(mensagem);
    this.name = new.target.name;
  }
}
