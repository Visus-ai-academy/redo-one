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
  ListarQuebrasDto,
  PaginaQuebrasDto,
  PecaDto,
  QuebraDetalheDto,
  QuebraDto,
} from './dto/quebra.dto';
import { QuebrasService } from './quebras.service';

/** Quebras de estudo; ficam na tela Exames, com as permissões dela. */
@ApiTags('catalogo')
@Controller('catalogo/quebras')
export class QuebrasController {
  constructor(private readonly service: QuebrasService) {}

  @Get()
  @Permissao('exames.ver')
  @ApiOkResponse({ type: PaginaQuebrasDto })
  async listar(@Query() query: ListarQuebrasDto): Promise<PaginaQuebrasDto> {
    const { itens, total } = await this.service.listar({
      busca: query.busca,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get(':id')
  @Permissao('exames.ver')
  @ApiOkResponse({ type: QuebraDetalheDto })
  @ApiNotFoundResponse()
  async obter(@Param('id', ParseUUIDPipe) id: string): Promise<QuebraDetalheDto> {
    const { chaveNormalizada: _, ...quebra } = await this.service.obter(id);
    return quebra;
  }

  @Post()
  @Permissao('exames.editar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiConflictResponse({ description: 'Já existe quebra para esse estudo.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: QuebraDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('exames.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Já existe quebra para esse estudo.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: QuebraDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('exames.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }

  @Post(':id/pecas')
  @Permissao('exames.editar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Exame inexistente ou o próprio estudo.' })
  @ApiConflictResponse({ description: 'O estudo já se quebra nesse exame.' })
  async adicionarPeca(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: PecaDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.adicionarPeca({ usuarioId: ator.usuarioId }, id, corpo) };
  }

  @Put(':id/pecas/:pecaId')
  @Permissao('exames.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Exame inexistente ou o próprio estudo.' })
  @ApiConflictResponse({ description: 'O estudo já se quebra nesse exame.' })
  atualizarPeca(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pecaId', ParseUUIDPipe) pecaId: string,
    @Body() corpo: PecaDto,
  ): Promise<void> {
    return this.service.atualizarPeca({ usuarioId: ator.usuarioId }, id, pecaId, corpo);
  }

  @Delete(':id/pecas/:pecaId')
  @Permissao('exames.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  removerPeca(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pecaId', ParseUUIDPipe) pecaId: string,
  ): Promise<void> {
    return this.service.removerPeca({ usuarioId: ator.usuarioId }, id, pecaId);
  }
}
