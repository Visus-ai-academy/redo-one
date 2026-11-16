import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { ListarOcorrenciasDto, OcorrenciasDto } from './dto/ocorrencias.dto';
import { OcorrenciasService } from './ocorrencias.service';

@ApiTags('escala')
@Controller('escala/ocorrencias')
export class OcorrenciasController {
  constructor(@Inject(OcorrenciasService) private readonly service: OcorrenciasService) {}

  @Get()
  @Permissao('escala.ver')
  @ApiOkResponse({
    type: OcorrenciasDto,
    description: 'Plantões da janela (até 62 dias) no recorte de quem consulta, e os conflitos.',
  })
  @ApiBadRequestResponse({ description: 'Período inválido ou maior que 62 dias.' })
  listar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Query() query: ListarOcorrenciasDto,
  ): Promise<OcorrenciasDto> {
    return this.service.listar(
      { usuarioId: principal.usuarioId, acessoTotal: principal.acessoTotal },
      {
        de: query.de,
        ate: query.ate,
        ...(query.medicoId ? { medicoId: query.medicoId } : {}),
        ...(query.turnoIds?.length ? { turnoIds: query.turnoIds } : {}),
        ...(query.frenteIds?.length ? { frenteIds: query.frenteIds } : {}),
      },
    );
  }
}
