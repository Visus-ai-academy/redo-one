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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { AusenciasService, type Gestor } from './ausencias.service';
import {
  AusenciaDto,
  AusenciaItemDto,
  AusenciasCriadasDto,
  ContagemPendentesDto,
  CriarAusenciasDto,
  ListarAusenciasDto,
  PaginaAusenciasDto,
  RecusarAusenciaDto,
} from './dto/ausencia.dto';

const gestor = (p: PrincipalUsuario): Gestor => ({
  usuarioId: p.usuarioId,
  acessoTotal: p.acessoTotal,
});

/**
 * Tela de ausências do gestor. A gestora com recorte só vê e mexe nas ausências de médicos com
 * alocação vigente no recorte; as demais respondem 404.
 */
@ApiTags('escala')
@Controller('escala/ausencias')
export class AusenciasController {
  constructor(@Inject(AusenciasService) private readonly service: AusenciasService) {}

  @Get()
  @Permissao('escala.ver')
  @ApiOkResponse({ type: PaginaAusenciasDto, description: 'Pendentes primeiro.' })
  @ApiBadRequestResponse({ description: 'Período inválido.' })
  async listar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Query() query: ListarAusenciasDto,
  ): Promise<PaginaAusenciasDto> {
    const { pagina, porPagina, ...filtros } = query;
    const { itens, total } = await this.service.listar(gestor(principal), {
      ...filtros,
      pagina,
      porPagina,
    });
    return { itens, total, pagina, porPagina };
  }

  @Get('pendentes/contagem')
  @Permissao('escala.ausencia.aprovar')
  @ApiOkResponse({ type: ContagemPendentesDto, description: 'Pedidos pendentes no recorte.' })
  async contarPendentes(
    @PrincipalAtual() principal: PrincipalUsuario,
  ): Promise<ContagemPendentesDto> {
    return { pendentes: await this.service.contarPendentes(gestor(principal)) };
  }

  @Get(':id')
  @Permissao('escala.ver')
  @ApiOkResponse({ type: AusenciaItemDto })
  @ApiNotFoundResponse()
  obter(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AusenciaItemDto> {
    return this.service.obter(gestor(principal), id);
  }

  @Post()
  @Permissao('escala.ausencia.editar')
  @ApiCreatedResponse({ type: AusenciasCriadasDto, description: 'Uma ausência por médico.' })
  @ApiBadRequestResponse({ description: 'Período, dias, tipo inativo ou cadastro inexistente.' })
  @ApiForbiddenResponse({ description: 'Médico ou frente fora do recorte da gestora.' })
  async criar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Body() corpo: CriarAusenciasDto,
  ): Promise<AusenciasCriadasDto> {
    return { ids: await this.service.criar(gestor(principal), corpo) };
  }

  @Put(':id')
  @Permissao('escala.ausencia.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({ description: 'Período, dias, tipo inativo ou cadastro inexistente.' })
  @ApiForbiddenResponse({ description: 'Frente fora do recorte da gestora.' })
  atualizar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: AusenciaDto,
  ): Promise<void> {
    return this.service.atualizar(gestor(principal), id, corpo);
  }

  @Delete(':id')
  @Permissao('escala.ausencia.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  excluir(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir(gestor(principal), id);
  }

  @Post(':id/aprovar')
  @Permissao('escala.ausencia.aprovar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({ description: 'A solicitação já foi revisada.' })
  aprovar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.aprovar(gestor(principal), id);
  }

  @Post(':id/recusar')
  @Permissao('escala.ausencia.aprovar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({ description: 'Sem motivo ou a solicitação já foi revisada.' })
  recusar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: RecusarAusenciaDto,
  ): Promise<void> {
    return this.service.recusar(gestor(principal), id, corpo.motivo);
  }
}
