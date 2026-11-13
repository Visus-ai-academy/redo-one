import { Body, Controller, Headers, HttpCode, HttpStatus, Ip, Post, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { gravarCookieSessao, type RespostaComCookie } from '../acesso/cookie';
import { Public } from '../acesso/decorators';
import { SessaoDto } from '../autenticacao/dto/sessao.dto';
import {
  ConsultaLinkDto,
  DefinirSenhaDto,
  InfoLinkDto,
  RecuperacaoSenhaDto,
  SenhaFracaDto,
} from './dto/senha.dto';
import { SenhaService } from './senha.service';

@ApiTags('identidade')
@Controller('senha')
export class SenhaController {
  constructor(private readonly senha: SenhaService) {}

  @Post('recuperacao')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({
    description: 'Sempre 202, exista a conta ou não: não revela quais e-mails têm cadastro.',
  })
  solicitarRecuperacao(@Body() corpo: RecuperacaoSenhaDto): Promise<void> {
    return this.senha.solicitarRecuperacao(corpo.email);
  }

  // POST, e não GET com o token na URL, para o token não ficar em log de acesso.
  @Post('link')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: InfoLinkDto })
  @ApiNotFoundResponse({ description: 'Link desconhecido, vencido ou já usado.' })
  consultarLink(@Body() corpo: ConsultaLinkDto): Promise<InfoLinkDto> {
    return this.senha.consultarLink(corpo.token);
  }

  @Post('definir')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: SessaoDto, description: 'Senha gravada e sessão aberta (cookie).' })
  @ApiBadRequestResponse({ type: SenhaFracaDto })
  @ApiNotFoundResponse({ description: 'Link desconhecido, vencido ou já usado.' })
  async definir(
    @Body() corpo: DefinirSenhaDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) resposta: Pick<RespostaComCookie, 'cookie'>,
  ): Promise<SessaoDto> {
    const sessao = await this.senha.definirSenha({
      token: corpo.token,
      senha: corpo.senha,
      ip,
      userAgent: userAgent ?? null,
    });
    gravarCookieSessao(resposta, sessao);
    return { usuario: sessao.usuario, expiraEm: sessao.expiraEm };
  }
}
