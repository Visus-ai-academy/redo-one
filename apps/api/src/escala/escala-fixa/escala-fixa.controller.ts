import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import type { AtorEscala } from '../alocacoes/eventos';
import {
  DefinirEscalaFixaDto,
  EscalaFixaDto,
  EscalaFixaQueryDto,
  ResultadoEscalaFixaDto,
} from './dto/escala-fixa.dto';
import { EscalaFixaService } from './escala-fixa.service';

const atorDe = (principal: PrincipalUsuario): AtorEscala => ({
  usuarioId: principal.usuarioId,
  acessoTotal: principal.acessoTotal,
});

/** "Montar escala do médico": a grade turnos × dias da semana de um médico numa frente. */
@ApiTags('escala')
@Controller('escala/medicos')
export class EscalaFixaController {
  constructor(@Inject(EscalaFixaService) private readonly service: EscalaFixaService) {}

  @Get(':medicoId/escala-fixa')
  @Permissao('escala.ver')
  @ApiOkResponse({ type: EscalaFixaDto })
  obter(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('medicoId', ParseUUIDPipe) medicoId: string,
    @Query() query: EscalaFixaQueryDto,
  ): Promise<EscalaFixaDto> {
    return this.service.obter(atorDe(principal), medicoId, query.frenteId);
  }

  @Put(':medicoId/escala-fixa')
  @Permissao('escala.alocacao.editar')
  @ApiOkResponse({ type: ResultadoEscalaFixaDto })
  @ApiBadRequestResponse({
    description: 'Célula repetida, turno sem a frente, médico inativo ou data inválida.',
  })
  @ApiForbiddenResponse({ description: 'Alguma célula fora do recorte da gestora.' })
  definir(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('medicoId', ParseUUIDPipe) medicoId: string,
    @Body() corpo: DefinirEscalaFixaDto,
  ): Promise<ResultadoEscalaFixaDto> {
    return this.service.definir(atorDe(principal), medicoId, corpo);
  }
}
