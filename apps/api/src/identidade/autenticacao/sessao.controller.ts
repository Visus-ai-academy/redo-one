import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { COOKIE_SESSAO } from '../acesso/cookie';
import { PrincipalAtual, Public } from '../acesso/decorators';
import type { Principal } from '../principal';
import { AcessoBloqueadoError, CredenciaisInvalidasError } from './autenticacao.errors';
import { AutenticacaoService } from './autenticacao.service';
import { LoginDto } from './dto/login.dto';
import { AcessoBloqueadoDto, ErroLoginDto, SessaoAtualDto, SessaoDto } from './dto/sessao.dto';

/** Só o que o controller usa da resposta do Express. */
interface RespostaComCookie {
  cookie(nome: string, valor: string, opcoes: Record<string, unknown>): void;
  clearCookie(nome: string, opcoes: Record<string, unknown>): void;
}

@ApiTags('identidade')
@Controller('sessao')
export class SessaoController {
  constructor(private readonly autenticacao: AutenticacaoService) {}

  @Post()
  @Public()
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

  @Get()
  @ApiOkResponse({ type: SessaoAtualDto, description: 'Quem está logado e o que pode fazer.' })
  @ApiUnauthorizedResponse({ description: 'Sem sessão válida.' })
  atual(@PrincipalAtual() principal: Principal): SessaoAtualDto {
    return {
      usuario: {
        id: principal.usuarioId,
        nome: principal.nome,
        email: principal.email,
        papelId: principal.papelId,
      },
      acessoTotal: principal.acessoTotal,
      permissoes: [...principal.permissoes].sort(),
    };
  }

  @Delete()
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Sessão encerrada e cookie apagado.' })
  async sair(
    @PrincipalAtual({ opcional: true }) principal: Principal | undefined,
    @Res({ passthrough: true }) resposta: RespostaComCookie,
  ): Promise<void> {
    if (principal) await this.autenticacao.sair(principal.sessaoId);
    resposta.clearCookie(COOKIE_SESSAO, { path: '/' });
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
