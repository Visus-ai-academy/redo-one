import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Ip,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AcessoBloqueadoError, CredenciaisInvalidasError } from './autenticacao.errors';
import { AutenticacaoService } from './autenticacao.service';
import { LoginDto } from './dto/login.dto';
import { AcessoBloqueadoDto, ErroLoginDto, SessaoDto } from './dto/sessao.dto';

export const COOKIE_SESSAO = 'one_sessao';

/** Só o que o controller usa da resposta do Express. */
interface RespostaComCookie {
  cookie(nome: string, valor: string, opcoes: Record<string, unknown>): void;
}

@ApiTags('identidade')
@Controller('sessao')
export class SessaoController {
  constructor(private readonly autenticacao: AutenticacaoService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: SessaoDto, description: 'Sessão aberta; o token vai no cookie.' })
  @ApiUnauthorizedResponse({ type: ErroLoginDto })
  @ApiTooManyRequestsResponse({ type: AcessoBloqueadoDto })
  async entrar(
    @Body() corpo: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) resposta: RespostaComCookie,
  ): Promise<SessaoDto> {
    try {
      const sessao = await this.autenticacao.entrar({
        identificador: corpo.identificador,
        senha: corpo.senha,
        ip,
        userAgent: userAgent ?? null,
      });
      resposta.cookie(COOKIE_SESSAO, sessao.token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        expires: sessao.expiraEm,
      });
      return { usuario: sessao.usuario, expiraEm: sessao.expiraEm };
    } catch (erro) {
      throw paraHttp(erro);
    }
  }
}

function paraHttp(erro: unknown): unknown {
  if (erro instanceof CredenciaisInvalidasError) {
    return new HttpException({ message: erro.message }, HttpStatus.UNAUTHORIZED);
  }
  if (erro instanceof AcessoBloqueadoError) {
    return new HttpException(
      { message: erro.message, bloqueadoAte: erro.ate.toISOString() },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  return erro;
}
