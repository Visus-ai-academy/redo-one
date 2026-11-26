import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import { type PrincipalUsuario, temPermissao } from '../../../identidade/principal';
import {
  CancelarAdicional,
  LancarAdicional,
  ListarAdicionais,
} from '../../application/use-cases/adicionais';
import {
  CriarAlternativaPreco,
  CriarReclassificacao,
  CriarVersaoParametros,
  EncerrarConfiguracao,
  ListarParametros,
  ListarRegrasDoRepasse,
} from '../../application/use-cases/configuracao';
import { RecalcularRepasse } from '../../application/use-cases/recalcular-repasse';
import {
  AdicionalDto,
  AdicionalLancadoDto,
  APartirDeDto,
  CompetenciaRepasseParamDto,
  CompetenciaRepasseQueryDto,
  CriadoDto,
  CriarAlternativaPrecoDto,
  CriarParametrosRepasseDto,
  CriarReclassificacaoDto,
  IdParamDto,
  LancarAdicionalDto,
  MotivoDto,
  ParametrosRepasseDto,
  RecalculoRepasseCriadoDto,
  RegrasDoRepasseDto,
} from './dto/repasse.dto';

const recorte = (r: { todos: boolean; ids: string[] }) => (r.todos ? null : r.ids);

/**
 * Repasse dos médicos: recálculo da competência fechada, parâmetros, reclassificações, categorias
 * alternativas de preço e adicionais. As telas vêm depois; a API já existe para configurar o que o
 * dashboards-one tinha fixo no código.
 */
@ApiTags('repasse')
@Controller('repasse')
export class RepasseController {
  constructor(
    private readonly recalcularCaso: RecalcularRepasse,
    private readonly listarParametrosCaso: ListarParametros,
    private readonly criarParametrosCaso: CriarVersaoParametros,
    private readonly listarRegrasCaso: ListarRegrasDoRepasse,
    private readonly criarReclassificacaoCaso: CriarReclassificacao,
    private readonly criarAlternativaCaso: CriarAlternativaPreco,
    private readonly encerrarCaso: EncerrarConfiguracao,
    private readonly lancarCaso: LancarAdicional,
    private readonly cancelarCaso: CancelarAdicional,
    private readonly listarAdicionaisCaso: ListarAdicionais,
  ) {}

  @Post('competencias/:competencia/recalcular')
  @Permissao('repasse.recalcular')
  @ApiCreatedResponse({
    type: RecalculoRepasseCriadoDto,
    description:
      'Pedido gravado com o motivo (histórico em /faturamento/competencias/:c/recalculos); o repasse é refeito em segundo plano como versão nova.',
  })
  @ApiBadRequestResponse({ description: 'Competência fora do formato ou motivo vazio.' })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'A competência está aberta (ela se recalcula sozinha).' })
  async recalcular(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { competencia }: CompetenciaRepasseParamDto,
    @Body() { motivo }: MotivoDto,
  ): Promise<RecalculoRepasseCriadoDto> {
    return { id: await this.recalcularCaso.executar(ator.usuarioId, competencia, motivo) };
  }

  @Get('parametros')
  @Permissao('repasse.ver')
  @ApiOkResponse({ type: [ParametrosRepasseDto], description: 'Versões, a mais antiga primeiro.' })
  parametros(): Promise<ParametrosRepasseDto[]> {
    return this.listarParametrosCaso.executar();
  }

  @Post('parametros')
  @Permissao('repasse.parametros.editar')
  @ApiCreatedResponse({
    type: CriadoDto,
    description: 'Nova versão, que vale a partir de `aPartirDe`.',
  })
  @ApiBadRequestResponse()
  async criarParametros(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() { aPartirDe, ...dados }: CriarParametrosRepasseDto,
  ): Promise<CriadoDto> {
    return {
      id: await this.criarParametrosCaso.executar(ator.usuarioId, aPartirDe, {
        ...dados,
        contratadoRegistroId: dados.contratadoRegistroId ?? null,
      }),
    };
  }

  @Get('regras')
  @Permissao('repasse.ver')
  @ApiOkResponse({
    type: RegrasDoRepasseDto,
    description: 'Reclassificações e alternativas, todas as versões.',
  })
  regras(): Promise<RegrasDoRepasseDto> {
    return this.listarRegrasCaso.executar();
  }

  @Post('reclassificacoes')
  @Permissao('repasse.parametros.editar')
  @ApiCreatedResponse({ type: CriadoDto })
  @ApiBadRequestResponse()
  async criarReclassificacao(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() d: CriarReclassificacaoDto,
  ): Promise<CriadoDto> {
    return {
      id: await this.criarReclassificacaoCaso.executar(ator.usuarioId, d.aPartirDe, {
        ordem: d.ordem,
        descricao: d.descricao,
        modalidadeIds: recorte(d.modalidades),
        especialidadeIds: recorte(d.especialidades),
        categoriaIds: recorte(d.categorias),
        equipeIds: recorte(d.equipes),
        especialidadeDestinoId: d.especialidadeDestinoId ?? null,
        categoriaDestinoId: d.categoriaDestinoId ?? null,
      }),
    };
  }

  @Post('reclassificacoes/:id/encerrar')
  @Permissao('repasse.parametros.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deixa de valer a partir de `aPartirDe`.' })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  encerrarReclassificacao(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { id }: IdParamDto,
    @Body() { aPartirDe }: APartirDeDto,
  ): Promise<void> {
    return this.encerrarCaso.executar(ator.usuarioId, 'reclassificacao', id, aPartirDe);
  }

  @Post('alternativas-preco')
  @Permissao('repasse.parametros.editar')
  @ApiCreatedResponse({ type: CriadoDto })
  @ApiBadRequestResponse()
  async criarAlternativa(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() d: CriarAlternativaPrecoDto,
  ): Promise<CriadoDto> {
    return {
      id: await this.criarAlternativaCaso.executar(ator.usuarioId, d.aPartirDe, {
        ordem: d.ordem,
        especialidadeId: d.todasEspecialidades ? null : (d.especialidadeId ?? null),
        semCategoria: d.semCategoria,
        categoriaOrigemId: d.semCategoria ? null : (d.categoriaOrigemId ?? null),
        categoriaDestinoId: d.categoriaDestinoId,
      }),
    };
  }

  @Post('alternativas-preco/:id/encerrar')
  @Permissao('repasse.parametros.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  encerrarAlternativa(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { id }: IdParamDto,
    @Body() { aPartirDe }: APartirDeDto,
  ): Promise<void> {
    return this.encerrarCaso.executar(ator.usuarioId, 'alternativa', id, aPartirDe);
  }

  @Get('adicionais')
  @Permissao('repasse.ver')
  @ApiOkResponse({ type: [AdicionalDto], description: 'Da competência, os cancelados também.' })
  adicionais(@Query() { competencia }: CompetenciaRepasseQueryDto): Promise<AdicionalDto[]> {
    return this.listarAdicionaisCaso.executar(competencia);
  }

  @Post('adicionais')
  @Permissao('repasse.adicional.lancar')
  @ApiCreatedResponse({ type: AdicionalLancadoDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  @ApiConflictResponse({ description: 'Peer Review de mês já pago.' })
  @ApiForbiddenResponse({ description: 'Lançar na fechada sem a permissão própria.' })
  lancar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() d: LancarAdicionalDto,
  ): Promise<AdicionalLancadoDto> {
    return this.lancarCaso.executar(
      {
        usuarioId: ator.usuarioId,
        podeLancarNaFechada: temPermissao(ator, 'repasse.adicional.lancar_fechada'),
      },
      d,
    );
  }

  @Post('adicionais/:id/cancelar')
  @Permissao('repasse.adicional.lancar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Cancelado (fica registrado); a prévia é refeita.' })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Já cancelado, ou a competência está fechada.' })
  cancelar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { id }: IdParamDto,
    @Body() { motivo }: MotivoDto,
  ): Promise<void> {
    return this.cancelarCaso.executar(ator.usuarioId, id, motivo);
  }
}
