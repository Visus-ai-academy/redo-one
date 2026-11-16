import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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

import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { IdCriadoDto, ListarDto } from '../comum/dto';
import {
  PaginaSubespecialidadesDto,
  SubespecialidadeDto,
  SubespecialidadeItemDto,
} from '../listas/dto/lista.dto';
import { SubespecialidadesService } from './subespecialidades.service';

@ApiTags('catalogo')
@Controller('catalogo/subespecialidades')
export class SubespecialidadesController {
  constructor(private readonly service: SubespecialidadesService) {}

  @Get()
  @Permissao('catalogo.ver')
  @ApiOkResponse({ type: PaginaSubespecialidadesDto })
  async listar(@Query() query: ListarDto): Promise<PaginaSubespecialidadesDto> {
    const { itens, total } = await this.service.listar({
      busca: query.busca,
      ativo: query.ativo,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get(':id')
  @Permissao('catalogo.ver')
  @ApiOkResponse({ type: SubespecialidadeItemDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<SubespecialidadeItemDto> {
    return this.service.obter(id);
  }

  @Post()
  @Permissao('catalogo.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Sem especialidade ou especialidade inexistente.' })
  @ApiConflictResponse({ description: 'Nome já usado.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: SubespecialidadeDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('catalogo.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Sem especialidade ou especialidade inexistente.' })
  @ApiConflictResponse({ description: 'Nome já usado.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: SubespecialidadeDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('catalogo.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Em uso por exames: desative em vez de excluir.' })
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}
