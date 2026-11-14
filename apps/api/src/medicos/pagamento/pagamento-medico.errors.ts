import { ErroDeDominio } from '../../comum/erro-de-dominio';

/** Chave Pix sem o tipo (ou o contrário): o pagamento não saberia como usá-la. */
export class ChavePixIncompletaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}
