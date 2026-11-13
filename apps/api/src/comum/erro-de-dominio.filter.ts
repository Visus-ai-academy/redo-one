import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';

import { ErroDeDominio, type TipoErro } from './erro-de-dominio';

const STATUS: Record<TipoErro, HttpStatus> = {
  nao_encontrado: HttpStatus.NOT_FOUND,
  conflito: HttpStatus.CONFLICT,
  invalido: HttpStatus.BAD_REQUEST,
  proibido: HttpStatus.FORBIDDEN,
};

/** Responde erros de domínio com o status do tipo, no mesmo formato das HttpException do Nest. */
@Catch(ErroDeDominio)
export class ErroDeDominioFilter implements ExceptionFilter {
  catch(erro: ErroDeDominio, host: ArgumentsHost) {
    const statusCode = STATUS[erro.tipo];
    host
      .switchToHttp()
      .getResponse<{ status(codigo: number): { json(corpo: unknown): void } }>()
      .status(statusCode)
      .json({ statusCode, message: erro.message, ...erro.detalhes });
  }
}
