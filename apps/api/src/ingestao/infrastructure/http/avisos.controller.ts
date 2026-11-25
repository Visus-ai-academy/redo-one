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
import {
  ListarAvisos,
  ObterParametros,
  ResumoAvisosDoResponsavel,
  SelosDeAviso,
} from '../../application/use-cases/consultas-simples';
import { ConfigurarTipoAviso, ListarTiposAviso } from '../../application/use-cases/tipos-aviso';
import { TriarAviso } from '../../application/use-cases/triar-aviso';
import {
  AtualizarTipoAvisoDto,
  AvisoDto,
  IgnorarAvisoDto,
  ListarAvisosDto,
  PaginaAvisosDto,
  ParametrosIngestaoDto,
  ResumoAvisosDto,
  SeloAvisoDto,
  SelosAvisoQueryDto,
  TipoAvisoParamDto,
  TiposAvisoDto,
} from './dto/aviso.dto';

/** Quem consulta, com os ids dos papéis (o recorte do responsável). */
const comPapeis = (ator: PrincipalUsuario) => ({
  ...ator,
  papeisIds: ator.papeis.map((p) => p.id),
});

/**
 * Avisos de inconsistência de todos os contextos (cadastro que falta na importação, preço repetido
 * na carga...). Cada um só aparece para quem vê a tela onde ele se resolve (`tiposDeAvisoVisiveis`).
 */
@ApiTags('ingestao')
@Controller('ingestao/avisos')
export class AvisosController {
  constructor(
    private readonly listarAvisos: ListarAvisos,
    private readonly triar: TriarAviso,
    private readonly resumo: ResumoAvisosDoResponsavel,
    private readonly selos: SelosDeAviso,
  ) {}

  @Get('resumo-do-responsavel')
  @Permissao('avisos.ver')
  @ApiOkResponse({
    type: ResumoAvisosDto,
    description:
      'A faixa do topo: pendentes dos tipos de que algum papel do usuário é responsável.',
  })
  resumoDoResponsavel(@PrincipalAtual() ator: PrincipalUsuario): Promise<ResumoAvisosDto> {
    return this.resumo.executar(comPapeis(ator));
  }

  @Get('selos')
  @Permissao('avisos.ver')
  @ApiOkResponse({
    type: [SeloAvisoDto],
    description: 'Avisos pendentes dos itens de uma página (o selo na lista e no painel).',
  })
  selosDosItens(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Query() q: SelosAvisoQueryDto,
  ): Promise<SeloAvisoDto[]> {
    return this.selos.executar(q.entidade, q.ids, ator);
  }

  @Get()
  @Permissao('avisos.ver')
  @ApiOkResponse({ type: PaginaAvisosDto })
  async listar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Query() q: ListarAvisosDto,
  ): Promise<PaginaAvisosDto> {
    const filtro = {
      pagina: q.pagina,
      porPagina: q.porPagina,
      status: q.status,
      tipo: q.tipo,
      busca: q.busca,
      meus: q.meus,
      competencia: q.competencia,
      entidade: q.entidade && q.entidadeId ? { tipo: q.entidade, id: q.entidadeId } : undefined,
    };
    return {
      ...(await this.listarAvisos.executar(filtro, comPapeis(ator))),
      pagina: q.pagina,
      porPagina: q.porPagina,
    };
  }

  @Get(':id')
  @Permissao('avisos.ver')
  @ApiOkResponse({ type: AvisoDto })
  @ApiNotFoundResponse({ description: 'Não existe ou é de um tipo que o usuário não vê.' })
  obter(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AvisoDto> {
    return this.listarAvisos.obter(id, ator);
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
    return this.triar.ignorar(ator, id, corpo.motivo);
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
    return this.triar.reabrir(ator, id);
  }
}

/** Configurações › Avisos: responsáveis e "impede fechar a competência" de cada tipo. */
@ApiTags('ingestao')
@Controller('ingestao/tipos-aviso')
export class TiposAvisoController {
  constructor(
    private readonly listar: ListarTiposAviso,
    private readonly configurar: ConfigurarTipoAviso,
  ) {}

  @Get()
  @Permissao('avisos-config.ver')
  @ApiOkResponse({ type: TiposAvisoDto })
  obter(): Promise<TiposAvisoDto> {
    return this.listar.executar();
  }

  @Put(':tipo')
  @Permissao('avisos-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Papel que não existe.' })
  @ApiNotFoundResponse()
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { tipo }: TipoAvisoParamDto,
    @Body() corpo: AtualizarTipoAvisoDto,
  ): Promise<void> {
    return this.configurar.executar(ator.usuarioId, tipo, corpo);
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
