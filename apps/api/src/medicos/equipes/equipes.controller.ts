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
import { EquipeDto, EquipeItemDto, PaginaEquipesDto } from './dto/equipe.dto';
import { EquipesService } from './equipes.service';

@ApiTags('medicos')
@Controller('equipes')
export class EquipesController {
  constructor(@Inject(EquipesService) private readonly service: EquipesService) {}

  @Get()
  @Permissao('medicos.ver')
  @ApiOkResponse({ type: PaginaEquipesDto })
  async listar(@Query() query: ListarDto): Promise<PaginaEquipesDto> {
    const { itens, total } = await this.service.listar({
      busca: query.busca,
      ativo: query.ativo,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get(':id')
  @Permissao('medicos.ver')
  @ApiOkResponse({ type: EquipeItemDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<EquipeItemDto> {
    return this.service.obter(id);
  }

  @Post()
  @Permissao('medicos.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Médico inexistente.' })
  @ApiConflictResponse({ description: 'Nome já usado.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: EquipeDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('medicos.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Médico inexistente.' })
  @ApiConflictResponse({ description: 'Nome já usado.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: EquipeDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('medicos.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Em uso por outro cadastro: desative em vez de excluir.' })
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}
