import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { DefinirEscopoDto, EscopoDto, MeuEscopoDto } from './dto/escopo.dto';
import { EscopoApiService } from './escopo-api.service';

@ApiTags('escala')
@Controller('escala/escopos')
export class EscopoApiController {
  constructor(private readonly escopos: EscopoApiService) {}

  /** Declarada antes de `:usuarioId`. */
  @Get('meu')
  @Permissao('escala.ver')
  @ApiOkResponse({ type: MeuEscopoDto, description: 'O recorte de quem está logado.' })
  async meu(@PrincipalAtual() principal: PrincipalUsuario): Promise<MeuEscopoDto> {
    return {
      escopo: await this.escopos.doPrincipal({
        usuarioId: principal.usuarioId,
        acessoTotal: principal.acessoTotal,
      }),
    };
  }

  @Get(':usuarioId')
  @Permissao('usuarios.ver')
  @ApiOkResponse({ type: EscopoDto, description: 'Listas vazias: sem recorte.' })
  @ApiNotFoundResponse()
  obter(@Param('usuarioId', ParseUUIDPipe) usuarioId: string): Promise<EscopoDto> {
    return this.escopos.obter(usuarioId);
  }

  @Put(':usuarioId')
  @Permissao('usuarios.escopo-escala.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Turno ou frente inexistente.' })
  @ApiForbiddenResponse({ description: 'Ninguém edita o próprio recorte.' })
  @ApiNotFoundResponse()
  definir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() corpo: DefinirEscopoDto,
  ): Promise<void> {
    return this.escopos.definir({ usuarioId: ator.usuarioId }, usuarioId, {
      veTodaEscala: corpo.veTodaEscala,
      turnoIds: corpo.turnoIds,
      frenteIds: corpo.frenteIds,
    });
  }
}
