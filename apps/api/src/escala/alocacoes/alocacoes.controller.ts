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
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { AjustesProdutividadeService } from './ajustes.service';
import { AlocacoesService } from './alocacoes.service';
import {
  AjusteDto,
  AlocacaoDto,
  AlocacaoItemDto,
  AvisosEscalaDto,
  CoberturaDto,
  CriadoComAvisosDto,
} from './dto/alocacao.dto';
import type { AtorEscala } from './eventos';

const atorDe = (principal: PrincipalUsuario): AtorEscala => ({
  usuarioId: principal.usuarioId,
  acessoTotal: principal.acessoTotal,
});

@ApiTags('escala')
@Controller('escala/alocacoes')
export class AlocacoesController {
  constructor(
    @Inject(AlocacoesService) private readonly alocacoes: AlocacoesService,
    @Inject(AjustesProdutividadeService) private readonly ajustes: AjustesProdutividadeService,
  ) {}

  @Get(':id')
  @Permissao('escala.ver')
  @ApiOkResponse({ type: AlocacaoItemDto })
  @ApiNotFoundResponse({ description: 'Não existe ou está fora do recorte de quem consulta.' })
  obter(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AlocacaoItemDto> {
    return this.alocacoes.obter(atorDe(principal), id);
  }

  @Post()
  @Permissao('escala.alocacao.editar')
  @ApiCreatedResponse({ type: CriadoComAvisosDto })
  @ApiBadRequestResponse({
    description: 'Regra da escala, médico inativo ou frente fora do turno.',
  })
  @ApiForbiddenResponse({ description: 'Turno e frente fora do recorte da gestora.' })
  criar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Body() corpo: AlocacaoDto,
  ): Promise<CriadoComAvisosDto> {
    return this.alocacoes.criar(atorDe(principal), corpo);
  }

  @Put(':id')
  @Permissao('escala.alocacao.editar')
  @ApiOkResponse({ type: AvisosEscalaDto })
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({ description: 'Regra da escala, ou é cobertura (use a rota dela).' })
  @ApiForbiddenResponse({ description: 'O novo turno e frente saem do recorte da gestora.' })
  atualizar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: AlocacaoDto,
  ): Promise<AvisosEscalaDto> {
    return this.alocacoes.atualizar(atorDe(principal), id, corpo);
  }

  @Delete(':id')
  @Permissao('escala.alocacao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Remove também as coberturas e os ajustes do vínculo.' })
  @ApiNotFoundResponse()
  remover(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.alocacoes.remover(atorDe(principal), id);
  }

  @Post(':id/coberturas')
  @Permissao('escala.alocacao.editar')
  @ApiCreatedResponse({ type: CriadoComAvisosDto })
  @ApiNotFoundResponse({ description: 'Vínculo titular não encontrado.' })
  @ApiBadRequestResponse({ description: 'Fora da vigência, sem plantão no período, etc.' })
  @ApiConflictResponse({ description: 'Outro médico já cobre o vínculo num desses plantões.' })
  criarCobertura(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: CoberturaDto,
  ): Promise<CriadoComAvisosDto> {
    return this.alocacoes.criarCobertura(atorDe(principal), id, corpo);
  }

  @Put(':id/ajustes/:data')
  @Permissao('escala.alocacao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({ description: 'Gratificada, data inválida ou dia sem plantão.' })
  definirAjuste(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('data') data: string,
    @Body() corpo: AjusteDto,
  ): Promise<void> {
    return this.ajustes.definir(atorDe(principal), id, data, corpo);
  }
}

@ApiTags('escala')
@Controller('escala/coberturas')
export class CoberturasController {
  constructor(@Inject(AlocacoesService) private readonly alocacoes: AlocacoesService) {}

  @Put(':id')
  @Permissao('escala.alocacao.editar')
  @ApiOkResponse({ type: AvisosEscalaDto })
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({ description: 'Não é cobertura, ou fora da regra.' })
  @ApiConflictResponse({ description: 'Outro médico já cobre o vínculo num desses plantões.' })
  atualizar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: CoberturaDto,
  ): Promise<AvisosEscalaDto> {
    return this.alocacoes.atualizarCobertura(atorDe(principal), id, corpo);
  }
}
