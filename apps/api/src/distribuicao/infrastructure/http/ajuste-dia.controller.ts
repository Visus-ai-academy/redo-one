import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { AtorEscala } from '../../application/ports/escala-do-ajuste';
import {
  DefinirAjusteDia,
  ListarAjustesDia,
  ObterAjusteDia,
  PreverPeriodoAjusteDia,
} from '../../application/use-cases/ajuste-dia';
import {
  AjusteDiaDto,
  AjustesDiaQueryDto,
  PeriodoAjusteDiaDto,
  PeriodoAjusteDiaQueryDto,
  RespostaAjusteDiaDto,
  SalvarAjusteDiaDto,
} from './dto/ajuste-dia.dto';

const atorDe = (p: PrincipalUsuario): AtorEscala => ({
  usuarioId: p.usuarioId,
  acessoTotal: p.acessoTotal,
});

/**
 * Ajuste do dia da distribuição (prioridades liberadas, "segue o SLA neste dia", cliente), por
 * alocação e dia. A ação fica na tela Escala: permissões da escala e recorte da gestora.
 */
@ApiTags('distribuicao')
@Controller('distribuicao')
export class AjustesDiaController {
  constructor(
    private readonly obterAjuste: ObterAjusteDia,
    private readonly definir: DefinirAjusteDia,
    private readonly listarAjustes: ListarAjustesDia,
    private readonly prever: PreverPeriodoAjusteDia,
  ) {}

  @Get('ajustes-dia')
  @Permissao('escala.ver')
  @ApiOkResponse({ type: [AjusteDiaDto] })
  @ApiBadRequestResponse()
  listar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Query() q: AjustesDiaQueryDto,
  ): Promise<AjusteDiaDto[]> {
    return this.listarAjustes.executar(atorDe(principal), q);
  }

  @Get('alocacoes/:alocacaoId/ajustes-dia/:data')
  @Permissao('escala.ver')
  @ApiOkResponse({ type: RespostaAjusteDiaDto })
  @ApiNotFoundResponse()
  async obter(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('alocacaoId', ParseUUIDPipe) alocacaoId: string,
    @Param('data') data: string,
  ): Promise<RespostaAjusteDiaDto> {
    return { ajuste: await this.obterAjuste.executar(atorDe(principal), alocacaoId, data) };
  }

  @Get('alocacoes/:alocacaoId/ajustes-dia/:data/periodo')
  @Permissao('escala.ver')
  @ApiOkResponse({ type: PeriodoAjusteDiaDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  periodo(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('alocacaoId', ParseUUIDPipe) alocacaoId: string,
    @Param('data') data: string,
    @Query() q: PeriodoAjusteDiaQueryDto,
  ): Promise<PeriodoAjusteDiaDto> {
    return this.prever.executar(atorDe(principal), alocacaoId, data, q.ate ?? data);
  }

  @Put('alocacoes/:alocacaoId/ajustes-dia/:data')
  @Permissao('escala.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Ajuste vazio remove os do período (ou o do dia).' })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  salvar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('alocacaoId', ParseUUIDPipe) alocacaoId: string,
    @Param('data') data: string,
    @Body() corpo: SalvarAjusteDiaDto,
  ): Promise<void> {
    const { ate, ...ajuste } = corpo;
    return this.definir.executar(atorDe(principal), alocacaoId, data, ajuste, ate ?? data);
  }
}
