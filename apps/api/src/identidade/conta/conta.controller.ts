import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PrincipalAtual } from '../acesso/decorators';
import type { PrincipalUsuario } from '../principal';
import { ContaService } from './conta.service';
import {
  AcessoRecenteDto,
  AtualizarContaDto,
  MinhaContaDto,
  SenhaTrocadaDto,
  TrocarSenhaDto,
} from './dto/conta.dto';

/** Meu perfil. Basta estar logado: cada um só mexe na própria conta. */
@ApiTags('identidade')
@Controller('conta')
export class ContaController {
  constructor(private readonly conta: ContaService) {}

  @Get()
  @ApiOkResponse({ type: MinhaContaDto })
  obter(@PrincipalAtual() eu: PrincipalUsuario): Promise<MinhaContaDto> {
    return this.conta.obter(eu);
  }

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  atualizar(
    @PrincipalAtual() eu: PrincipalUsuario,
    @Body() corpo: AtualizarContaDto,
  ): Promise<void> {
    return this.conta.atualizarNome(eu, corpo.nome);
  }

  @Post('senha')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SenhaTrocadaDto })
  @ApiBadRequestResponse({ description: 'Senha atual errada ou senha nova fraca.' })
  trocarSenha(
    @PrincipalAtual() eu: PrincipalUsuario,
    @Body() corpo: TrocarSenhaDto,
  ): Promise<SenhaTrocadaDto> {
    return this.conta.trocarSenha(eu, { senhaAtual: corpo.senhaAtual, novaSenha: corpo.novaSenha });
  }

  @Delete('sessoes')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Todas as outras sessões encerradas (esta continua).' })
  encerrarOutrasSessoes(@PrincipalAtual() eu: PrincipalUsuario): Promise<void> {
    return this.conta.encerrarSessoes(eu);
  }

  @Delete('sessoes/:sessaoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  encerrarSessao(
    @PrincipalAtual() eu: PrincipalUsuario,
    @Param('sessaoId', ParseUUIDPipe) sessaoId: string,
  ): Promise<void> {
    return this.conta.encerrarSessoes(eu, sessaoId);
  }

  @Get('acessos')
  @ApiOkResponse({ type: [AcessoRecenteDto], description: 'Entradas dos últimos 30 dias.' })
  acessos(@PrincipalAtual() eu: PrincipalUsuario): Promise<AcessoRecenteDto[]> {
    return this.conta.acessosRecentes(eu);
  }
}
