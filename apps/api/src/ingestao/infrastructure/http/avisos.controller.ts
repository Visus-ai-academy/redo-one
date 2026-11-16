import {
  Body,
  Controller,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import { AtualizarParametros } from '../../application/use-cases/atualizar-parametros';
import { ListarAvisos, ObterParametros } from '../../application/use-cases/consultas-simples';
import { TriarAviso } from '../../application/use-cases/triar-aviso';
import {
  IgnorarAvisoDto,
  ListarAvisosDto,
  PaginaAvisosDto,
  ParametrosIngestaoDto,
} from './dto/aviso.dto';

/** Avisos de cadastro (cliente, médico, estudo... desconhecido) encontrados na importação. */
@ApiTags('ingestao')
@Controller('ingestao/avisos')
export class AvisosController {
  constructor(
    private readonly listarAvisos: ListarAvisos,
    private readonly triar: TriarAviso,
  ) {}

  @Get()
  @Permissao('avisos.ver')
  @ApiOkResponse({ type: PaginaAvisosDto })
  async listar(@Query() q: ListarAvisosDto): Promise<PaginaAvisosDto> {
    const filtro = {
      pagina: q.pagina,
      porPagina: q.porPagina,
      status: q.status,
      tipo: q.tipo,
      busca: q.busca,
    };
    return {
      ...(await this.listarAvisos.executar(filtro)),
      pagina: q.pagina,
      porPagina: q.porPagina,
    };
  }

  @Post(':id/ignorar')
  @Permissao('avisos.triar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'O aviso não está pendente.' })
  ignorar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: IgnorarAvisoDto,
  ): Promise<void> {
    return this.triar.ignorar(ator.usuarioId, id, corpo.motivo || null);
  }

  @Post(':id/reabrir')
  @Permissao('avisos.triar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'O aviso não está ignorado.' })
  reabrir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.triar.reabrir(ator.usuarioId, id);
  }
}

/** Parâmetros da importação: trava contra arquivo truncado e retenção da linha crua. */
@ApiTags('ingestao')
@Controller('ingestao/parametros')
export class ParametrosIngestaoController {
  constructor(
    private readonly obterParametros: ObterParametros,
    private readonly atualizarParametros: AtualizarParametros,
  ) {}

  @Get()
  @Permissao('importacao.ver')
  @ApiOkResponse({ type: ParametrosIngestaoDto })
  obter(): Promise<ParametrosIngestaoDto> {
    return this.obterParametros.executar();
  }

  @Put()
  @Permissao('importacao.parametros.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: ParametrosIngestaoDto,
  ): Promise<void> {
    return this.atualizarParametros.executar(ator.usuarioId, corpo);
  }
}
