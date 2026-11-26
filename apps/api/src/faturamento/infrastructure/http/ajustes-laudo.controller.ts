import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import {
  CriarAjusteLaudo,
  EncerrarAjusteLaudo,
  ListarAjustesLaudo,
} from '../../application/use-cases/ajustes-laudo';
import {
  AjusteCriadoDto,
  AjusteLaudoDto,
  AjustesLaudoQueryDto,
  CriarAjusteLaudoDto,
  EncerrarAjusteLaudoDto,
} from './dto/ajustes-laudo.dto';

/** Ajuste manual do faturamento por laudo (valor forçado ou excluir), com motivo e histórico. */
@ApiTags('faturamento')
@Controller('faturamento/ajustes-laudo')
export class AjustesLaudoController {
  constructor(
    private readonly listarCaso: ListarAjustesLaudo,
    private readonly criarCaso: CriarAjusteLaudo,
    private readonly encerrarCaso: EncerrarAjusteLaudo,
  ) {}

  @Get()
  @Permissao('faturamento.ver')
  @ApiOkResponse({
    type: [AjusteLaudoDto],
    description: 'Vigentes e encerrados, o mais novo primeiro.',
  })
  listar(@Query() q: AjustesLaudoQueryDto): Promise<AjusteLaudoDto[]> {
    return this.listarCaso.executar(q.competencia);
  }

  @Post()
  @Permissao('faturamento.ajuste_laudo.editar')
  @ApiCreatedResponse({
    type: AjusteCriadoDto,
    description:
      'Troca o vigente do laudo (encerrado, no histórico). Na competência fechada, vale pelo recálculo com motivo.',
  })
  @ApiBadRequestResponse({ description: 'Sem motivo ou valor inválido.' })
  @ApiNotFoundResponse({ description: 'Laudo não encontrado.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() d: CriarAjusteLaudoDto,
  ): Promise<AjusteCriadoDto> {
    return { id: await this.criarCaso.executar(ator.usuarioId, d) };
  }

  @Post(':id/encerrar')
  @Permissao('faturamento.ajuste_laudo.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'O laudo volta à tabela de preços; o ajuste fica no histórico.',
  })
  @ApiNotFoundResponse()
  encerrar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: EncerrarAjusteLaudoDto,
  ): Promise<void> {
    return this.encerrarCaso.executar(ator.usuarioId, id, d.motivo);
  }
}
