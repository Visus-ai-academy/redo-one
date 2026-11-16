import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ListarDto } from '../../catalogo/comum/dto';
import { Permissao } from '../../identidade/acesso/decorators';
import { FrenteItemDto, PaginaFrentesDto } from './dto/frente.dto';
import { FrentesService } from './frentes.service';

/**
 * Só leitura, com `escala.ver`: a frente é uma especialidade ou modalidade do catálogo (editada
 * lá) e nasce sozinha quando um turno passa a usá-la.
 */
@ApiTags('escala')
@Controller('escala/frentes')
export class FrentesController {
  constructor(@Inject(FrentesService) private readonly service: FrentesService) {}

  @Get()
  @Permissao('escala.ver')
  @ApiOkResponse({ type: PaginaFrentesDto })
  async listar(@Query() query: ListarDto): Promise<PaginaFrentesDto> {
    const { itens, total } = await this.service.listar({
      busca: query.busca,
      ativo: query.ativo,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get(':id')
  @Permissao('escala.ver')
  @ApiOkResponse({ type: FrenteItemDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<FrenteItemDto> {
    return this.service.obter(id);
  }
}
