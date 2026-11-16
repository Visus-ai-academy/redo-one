import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { JanelaOcorrenciasDto, OcorrenciasDto } from './dto/ocorrencias.dto';
import { OcorrenciasService } from './ocorrencias.service';

/**
 * Portal do médico. Sem `@Permissao`: basta a sessão (o guard global de autenticação barra quem
 * não está logado e as chaves de robô); o recorte é o médico vinculado à conta.
 */
@ApiTags('escala')
@Controller('escala/portal/minha-escala')
export class MinhaEscalaController {
  constructor(@Inject(OcorrenciasService) private readonly service: OcorrenciasService) {}

  @Get()
  @ApiOkResponse({ type: OcorrenciasDto, description: 'Plantões do médico da conta na janela.' })
  @ApiBadRequestResponse({ description: 'Período inválido ou maior que 62 dias.' })
  @ApiForbiddenResponse({ description: 'Conta sem médico vinculado.' })
  listar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Query() query: JanelaOcorrenciasDto,
  ): Promise<OcorrenciasDto> {
    return this.service.minhaEscala(principal.usuarioId, { de: query.de, ate: query.ate });
  }
}
