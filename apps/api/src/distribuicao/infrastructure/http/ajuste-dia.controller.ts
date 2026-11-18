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
} from '../../application/use-cases/ajuste-dia';
import {
  AjusteDiaDto,
  AjusteDiaEdicaoDto,
  AjustesDiaQueryDto,
  RespostaAjusteDiaDto,
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

  @Put('alocacoes/:alocacaoId/ajustes-dia/:data')
  @Permissao('escala.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Ajuste vazio remove o do dia.' })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  salvar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('alocacaoId', ParseUUIDPipe) alocacaoId: string,
    @Param('data') data: string,
    @Body() corpo: AjusteDiaEdicaoDto,
  ): Promise<void> {
    return this.definir.executar(atorDe(principal), alocacaoId, data, corpo);
  }
}
