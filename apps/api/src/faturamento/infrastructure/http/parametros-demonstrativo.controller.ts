import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import {
  ListarAlternativasPreco,
  ListarParametrosDemonstrativo,
  MudarAlternativaPreco,
  MudarParametrosDemonstrativo,
} from '../../application/use-cases/parametros-demonstrativo';
import {
  IdCriadoDto,
  MudarAlternativaPrecoDto,
  MudarParametrosDemonstrativoDto,
  QuadroAlternativasDto,
  QuadroParametrosDto,
} from './dto/parametros-demonstrativo.dto';

/** Configurações › Faturamento: o que entra no demonstrativo e a prioridade alternativa do preço. */
@ApiTags('faturamento')
@Controller('faturamento')
export class ParametrosDemonstrativoController {
  constructor(
    private readonly listarParametrosCaso: ListarParametrosDemonstrativo,
    private readonly mudarParametrosCaso: MudarParametrosDemonstrativo,
    private readonly listarAlternativasCaso: ListarAlternativasPreco,
    private readonly mudarAlternativaCaso: MudarAlternativaPreco,
  ) {}

  @Get('parametros-demonstrativo')
  @Permissao('faturamento.ver')
  @ApiOkResponse({ type: QuadroParametrosDto })
  parametros(): Promise<QuadroParametrosDto> {
    return this.listarParametrosCaso.executar();
  }

  @Post('parametros-demonstrativo')
  @Permissao('faturamento.parametros.editar')
  @ApiCreatedResponse({ type: IdCriadoDto, description: 'Versão nova a partir de aPartirDe.' })
  @ApiBadRequestResponse({ description: 'Competência fechada ou item do catálogo inexistente.' })
  async mudarParametros(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: MudarParametrosDemonstrativoDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.mudarParametrosCaso.executar(ator.usuarioId, corpo) };
  }

  @Get('prioridades-alternativas')
  @Permissao('faturamento.ver')
  @ApiOkResponse({ type: QuadroAlternativasDto })
  alternativas(): Promise<QuadroAlternativasDto> {
    return this.listarAlternativasCaso.executar();
  }

  @Post('prioridades-alternativas')
  @Permissao('faturamento.parametros.editar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({
    description: 'Competência fechada, prioridade inexistente ou repetida.',
  })
  async mudarAlternativa(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: MudarAlternativaPrecoDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.mudarAlternativaCaso.executar(ator.usuarioId, corpo) };
  }
}
