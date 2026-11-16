import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { IdCriadoDto, ListarDto } from '../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { FrenteDto, FrenteItemDto, PaginaFrentesDto } from './dto/frente.dto';
import { FrentesService } from './frentes.service';

/** Leitura com `escala.ver`: as frentes alimentam as telas da escala, não só a de configuração. */
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

  @Post()
  @Permissao('escala-config.editar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Destino fora do tipo ou inexistente no catálogo.' })
  @ApiConflictResponse({ description: 'Rótulo já usado ou já há frente para esse destino.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: FrenteDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('escala-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({ description: 'Destino fora do tipo ou inexistente no catálogo.' })
  @ApiConflictResponse({ description: 'Rótulo já usado ou já há frente para esse destino.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: FrenteDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('escala-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: 'Em uso por turno, alocação, ausência ou recorte de gestora: desative.',
  })
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}
