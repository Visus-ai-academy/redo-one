import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { IdCriadoDto, PaginacaoDto } from '../../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import { ConsultarImportacoes } from '../../application/use-cases/consultar-importacoes';
import { ConfirmarEnvio, PrepararEnvio } from '../../application/use-cases/envio-planilha';
import { ConfirmarEnvioDto, EnvioDto, PedidoEnvioDto } from './dto/envio.dto';
import { ImportacaoDetalheDto, PaginaImportacoesDto, UrlDto } from './dto/importacao.dto';

/** Importação de laudos: envio da planilha (direto ao storage) e acompanhamento. */
@ApiTags('ingestao')
@Controller('ingestao')
export class ImportacoesController {
  constructor(
    private readonly prepararEnvioDaPlanilha: PrepararEnvio,
    private readonly confirmarEnvioDaPlanilha: ConfirmarEnvio,
    private readonly consultar: ConsultarImportacoes,
  ) {}

  @Get('importacoes')
  @Permissao('importacao.ver')
  @ApiOkResponse({ type: PaginaImportacoesDto })
  async listar(@Query() query: PaginacaoDto): Promise<PaginaImportacoesDto> {
    const paginacao = { pagina: query.pagina, porPagina: query.porPagina };
    return { ...(await this.consultar.listar(paginacao)), ...paginacao };
  }

  @Get('importacoes/:id')
  @Permissao('importacao.ver')
  @ApiOkResponse({ type: ImportacaoDetalheDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<ImportacaoDetalheDto> {
    return this.consultar.obter(id);
  }

  @Get('importacoes/:id/arquivo')
  @Permissao('importacao.ver')
  @ApiOkResponse({ type: UrlDto, description: 'URL assinada (5 min) da planilha enviada.' })
  @ApiNotFoundResponse()
  async baixarArquivo(@Param('id', ParseUUIDPipe) id: string): Promise<UrlDto> {
    return { url: await this.consultar.urlDoArquivo(id) };
  }

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
