import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
  ListarAlternativasPreco,
  ListarParametrosDemonstrativo,
  MudarAlternativaPreco,
  MudarParametrosDemonstrativo,
} from '../../application/use-cases/parametros-demonstrativo';
import {
  CriarReclassificacaoFaturamento,
  EncerrarReclassificacaoFaturamento,
  ListarReclassificacoesFaturamento,
} from '../../application/use-cases/reclassificacoes';
import {
  CriarReclassificacaoFaturamentoDto,
  EncerrarReclassificacaoFaturamentoDto,
  IdCriadoDto,
  MudarAlternativaPrecoDto,
  MudarParametrosDemonstrativoDto,
  QuadroAlternativasDto,
  QuadroParametrosDto,
  ReclassificacaoFaturamentoDto,
  type RecorteReclassificacaoDto,
} from './dto/parametros-demonstrativo.dto';

const recorte = (r: RecorteReclassificacaoDto) => (r.todos ? null : r.ids);

/** Configurações › Faturamento: o que entra no demonstrativo e a prioridade alternativa do preço. */
@ApiTags('faturamento')
@Controller('faturamento')
export class ParametrosDemonstrativoController {
  constructor(
    private readonly listarParametrosCaso: ListarParametrosDemonstrativo,
    private readonly mudarParametrosCaso: MudarParametrosDemonstrativo,
    private readonly listarAlternativasCaso: ListarAlternativasPreco,
    private readonly mudarAlternativaCaso: MudarAlternativaPreco,
    private readonly listarReclassificacoesCaso: ListarReclassificacoesFaturamento,
    private readonly criarReclassificacaoCaso: CriarReclassificacaoFaturamento,
    private readonly encerrarReclassificacaoCaso: EncerrarReclassificacaoFaturamento,
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

  @Get('reclassificacoes')
  @Permissao('faturamento.ver')
  @ApiOkResponse({
    type: [ReclassificacaoFaturamentoDto],
    description: 'Todas as versões, pela ordem (a primeira que casa vale).',
  })
  async reclassificacoes(): Promise<ReclassificacaoFaturamentoDto[]> {
    const lista = await this.listarReclassificacoesCaso.executar();
    const copia = (x: readonly string[] | null) => (x ? [...x] : null);
    return lista.map((r) => ({
      ...r,
      modalidadeIds: copia(r.modalidadeIds),
      especialidadeIds: copia(r.especialidadeIds),
      categoriaIds: copia(r.categoriaIds),
      equipeIds: copia(r.equipeIds),
    }));
  }

  @Post('reclassificacoes')
  @Permissao('faturamento.parametros.editar')
  @ApiCreatedResponse({ type: IdCriadoDto, description: 'Vale a partir de aPartirDe.' })
  @ApiBadRequestResponse({ description: 'Competência fechada, recorte vazio ou sem destino.' })
  async criarReclassificacao(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() d: CriarReclassificacaoFaturamentoDto,
  ): Promise<IdCriadoDto> {
    return {
      id: await this.criarReclassificacaoCaso.executar(ator.usuarioId, d.aPartirDe, {
        ordem: d.ordem,
        descricao: d.descricao,
        modalidadeIds: recorte(d.modalidades),
        especialidadeIds: recorte(d.especialidades),
        categoriaIds: recorte(d.categorias),
        equipeIds: recorte(d.equipes),
        especialidadeDestinoId: d.especialidadeDestinoId,
        categoriaDestinoId: d.categoriaDestinoId,
      }),
    };
  }

  @Post('reclassificacoes/:id/encerrar')
  @Permissao('faturamento.parametros.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deixa de valer a partir de aPartirDe.' })
  @ApiNotFoundResponse()
  encerrarReclassificacao(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: EncerrarReclassificacaoFaturamentoDto,
  ): Promise<void> {
    return this.encerrarReclassificacaoCaso.executar(ator.usuarioId, id, d.aPartirDe);
  }
}
