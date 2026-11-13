import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../acesso/decorators';
import type { PrincipalUsuario } from '../principal';
import { ChavesRoboService } from './chaves-robo.service';
import {
  ChaveCriadaDto,
  ChaveRoboDto,
  NovaChaveRoboDto,
  PermissaoRoboDto,
} from './dto/chave-robo.dto';
import { PERMISSOES_ROBO } from './permissoes-robo';

@ApiTags('identidade')
@Controller('chaves-robo')
export class ChavesRoboController {
  constructor(private readonly chaves: ChavesRoboService) {}

  @Get()
  @Permissao('chaves-robo.ver')
  @ApiOkResponse({ type: [ChaveRoboDto] })
  listar(): Promise<ChaveRoboDto[]> {
    return this.chaves.listar();
  }

  @Get('permissoes')
  @Permissao('chaves-robo.ver')
  @ApiOkResponse({ type: [PermissaoRoboDto], description: 'O que uma chave de robô pode receber.' })
  permissoes(): PermissaoRoboDto[] {
    return PERMISSOES_ROBO.map((p) => ({ chave: p.chave, rotulo: p.rotulo }));
  }

  @Post()
  @Permissao('chaves-robo.gerenciar')
  @ApiCreatedResponse({ type: ChaveCriadaDto })
  criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: NovaChaveRoboDto,
  ): Promise<ChaveCriadaDto> {
    return this.chaves.criar(ator, {
      nome: corpo.nome,
      descricao: corpo.descricao ?? null,
      permissoes: corpo.permissoes,
      validadeDias: corpo.validadeDias,
    });
  }

  @Post(':id/nova')
  @Permissao('chaves-robo.gerenciar')
  @ApiCreatedResponse({
    type: ChaveCriadaDto,
    description: 'Outra chave ativa para o mesmo robô; a antiga vale até ser revogada.',
  })
  @ApiNotFoundResponse()
  gerarNova(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ChaveCriadaDto> {
    return this.chaves.gerarNova(ator, id);
  }

  @Post(':id/revogar')
  @Permissao('chaves-robo.gerenciar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'O robô para de funcionar na próxima chamada.' })
  @ApiNotFoundResponse()
  revogar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.chaves.revogar(ator, id);
  }
}
