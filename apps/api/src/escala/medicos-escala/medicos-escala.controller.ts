import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Permissao } from '../../identidade/acesso/decorators';
import {
  ListarMedicosEscalaDto,
  MedicoEscalaDto,
  PaginaMedicosEscalaDto,
} from './dto/medicos-escala.dto';
import { MedicosEscalaService } from './medicos-escala.service';

/** Médicos para escolher na escala, só com `escala.ver` (sem dar `medicos.ver`). */
@ApiTags('escala')
@Controller('escala/medicos')
export class MedicosEscalaController {
  constructor(private readonly service: MedicosEscalaService) {}

  @Get()
  @Permissao('escala.ver')
  @ApiOkResponse({ type: PaginaMedicosEscalaDto, description: 'Por nome; só id, nome e situação.' })
  async listar(@Query() query: ListarMedicosEscalaDto): Promise<PaginaMedicosEscalaDto> {
    const { itens, total } = await this.service.listar({
      ...(query.busca ? { busca: query.busca } : {}),
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get(':id')
  @Permissao('escala.ver')
  @ApiOkResponse({ type: MedicoEscalaDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<MedicoEscalaDto> {
    return this.service.obter(id);
  }
}
