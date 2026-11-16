import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';

import { IdCriadoDto } from '../../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import { ConfirmarEnvio, PrepararEnvio } from '../../application/use-cases/envio-planilha';
import { ConfirmarEnvioDto, EnvioDto, PedidoEnvioDto } from './dto/envio.dto';

/** Importação de laudos: envio da planilha (direto ao storage) e acompanhamento. */
@ApiTags('ingestao')
@Controller('ingestao')
export class ImportacoesController {
  constructor(
    private readonly prepararEnvioDaPlanilha: PrepararEnvio,
    private readonly confirmarEnvioDaPlanilha: ConfirmarEnvio,
  ) {}

  @Post('envios')
  @Permissao('importacao.enviar')
  @ApiCreatedResponse({ type: EnvioDto })
  @ApiBadRequestResponse({ description: 'Arquivo que não é .xlsx, vazio ou acima de 50 MB.' })
  prepararEnvio(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: PedidoEnvioDto,
  ): Promise<EnvioDto> {
    return this.prepararEnvioDaPlanilha.executar({ usuarioId: ator.usuarioId, ...corpo });
  }

  @Post('importacoes')
  @Permissao('importacao.enviar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'A planilha não chegou ao storage ou já foi enviada.' })
  @ApiNotFoundResponse()
  async confirmarEnvio(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: ConfirmarEnvioDto,
  ): Promise<IdCriadoDto> {
    return {
      id: await this.confirmarEnvioDaPlanilha.executar({
        usuarioId: ator.usuarioId,
        arquivoId: corpo.arquivoId,
      }),
    };
  }
}
