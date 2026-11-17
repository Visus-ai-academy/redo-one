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
import { IdCriadoDto } from '../comum/dto';
import {
  ExameDetalheDto,
  ExameDto,
  ListarExamesDto,
  PaginaExamesDto,
  SubespecialidadeExameDto,
} from './dto/exame.dto';
import { ExamesService } from './exames.service';

@ApiTags('catalogo')
@Controller('catalogo/exames')
export class ExamesController {
  constructor(private readonly service: ExamesService) {}

  @Get()
  @Permissao('exames.ver')
  @ApiOkResponse({ type: PaginaExamesDto })
  async listar(@Query() query: ListarExamesDto): Promise<PaginaExamesDto> {
    const { itens, total } = await this.service.listar({
      busca: query.busca,
      modalidadeId: query.modalidadeId,
      especialidadeId: query.especialidadeId,
      subespecialidadeId: query.subespecialidadeId,
      ativo: query.ativo,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get(':id')
  @Permissao('exames.ver')
  @ApiOkResponse({ type: ExameDetalheDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<ExameDetalheDto> {
    return this.service.obter(id);
  }

  @Post()
  @Permissao('exames.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Cadastro ligado inexistente.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: ExameDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('exames.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Cadastro ligado inexistente.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: ExameDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Put(':id/subespecialidade')
  @Permissao('exames.subespecialidade.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Só a subespecialidade muda; os outros campos ficam.' })
  @ApiBadRequestResponse({ description: 'Subespecialidade inexistente.' })
  @ApiNotFoundResponse()
  definirSubespecialidade(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: SubespecialidadeExameDto,
  ): Promise<void> {
    return this.service.definirSubespecialidade(
      { usuarioId: ator.usuarioId },
      id,
      corpo.subespecialidadeId,
    );
  }

  @Delete(':id')
  @Permissao('exames.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Peça de uma quebra: desative em vez de excluir.' })
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}
