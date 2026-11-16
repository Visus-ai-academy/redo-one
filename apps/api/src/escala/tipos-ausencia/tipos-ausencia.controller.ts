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
import {
  PaginaTiposAusenciaDto,
  TipoAusenciaDto,
  TipoAusenciaItemDto,
} from './dto/tipo-ausencia.dto';
import type { TiposAusenciaService } from './tipos-ausencia.service';
import { TIPOS_AUSENCIA_SERVICE } from './tokens';

/** Leitura com `escala.ver`: os tipos alimentam o lançamento de ausências. */
@ApiTags('escala')
@Controller('escala/tipos-ausencia')
export class TiposAusenciaController {
  constructor(@Inject(TIPOS_AUSENCIA_SERVICE) private readonly service: TiposAusenciaService) {}

  @Get()
  @Permissao('escala.ver')
  @ApiOkResponse({ type: PaginaTiposAusenciaDto })
  async listar(@Query() query: ListarDto): Promise<PaginaTiposAusenciaDto> {
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
  @ApiOkResponse({ type: TipoAusenciaItemDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<TipoAusenciaItemDto> {
    return this.service.obter(id);
  }

  @Post()
  @Permissao('escala-config.editar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Gravidade inválida.' })
  @ApiConflictResponse({ description: 'Nome já usado.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: TipoAusenciaDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('escala-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({ description: 'Gravidade inválida.' })
  @ApiConflictResponse({ description: 'Nome já usado.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: TipoAusenciaDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('escala-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Em uso por uma ausência: desative em vez de excluir.' })
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}
