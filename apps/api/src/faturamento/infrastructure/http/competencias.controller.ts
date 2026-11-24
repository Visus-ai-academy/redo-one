import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PaginacaoDto } from '../../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import { FecharCompetencia } from '../../application/use-cases/fechar-competencia';
import { ListarCompetencias } from '../../application/use-cases/listar-competencias';
import { ReabrirCompetencia } from '../../application/use-cases/reabrir-competencia';
import {
  DestravarImportacao,
  TravarImportacao,
} from '../../application/use-cases/travar-importacao';
import { CompetenciaParamDto, PaginaCompetenciasDto } from './dto/competencia.dto';

/** Faturamento › Competências: lista, fechamento, reabertura e trava da importação. */
@ApiTags('faturamento')
@Controller('faturamento/competencias')
export class CompetenciasController {
  constructor(
    private readonly listarCaso: ListarCompetencias,
    private readonly fecharCaso: FecharCompetencia,
    private readonly reabrirCaso: ReabrirCompetencia,
    private readonly travarCaso: TravarImportacao,
    private readonly destravarCaso: DestravarImportacao,
  ) {}

  @Get()
  @Permissao('faturamento.ver')
  @ApiOkResponse({ type: PaginaCompetenciasDto, description: 'A mais nova primeiro.' })
  async listar(@Query() query: PaginacaoDto): Promise<PaginaCompetenciasDto> {
    const paginacao = { pagina: query.pagina, porPagina: query.porPagina };
    return { ...(await this.listarCaso.executar(paginacao)), ...paginacao };
  }

  @Post(':competencia/fechar')
  @Permissao('faturamento.competencia.fechar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Competência fora do formato AAAA-MM.' })
  @ApiNotFoundResponse({ description: 'Competência sem linha (nenhum laudo do mês ainda).' })
  @ApiConflictResponse({ description: 'Já fechada, ou o mês ainda não acabou em Brasília.' })
  fechar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { competencia }: CompetenciaParamDto,
  ): Promise<void> {
    return this.fecharCaso.executar(ator.usuarioId, competencia);
  }

  @Post(':competencia/reabrir')
  @Permissao('faturamento.competencia.reabrir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Reaberta; a trava da importação fica como estava.' })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Já aberta.' })
  reabrir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { competencia }: CompetenciaParamDto,
  ): Promise<void> {
    return this.reabrirCaso.executar(ator.usuarioId, competencia);
  }

  @Post(':competencia/travar')
  @Permissao('faturamento.competencia.travar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'A importação passa a ignorar os laudos da competência.' })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Já travada.' })
  travar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { competencia }: CompetenciaParamDto,
  ): Promise<void> {
    return this.travarCaso.executar(ator.usuarioId, competencia);
  }

  @Post(':competencia/destravar')
  @Permissao('faturamento.competencia.travar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Não está travada.' })
  destravar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { competencia }: CompetenciaParamDto,
  ): Promise<void> {
    return this.destravarCaso.executar(ator.usuarioId, competencia);
  }
}
