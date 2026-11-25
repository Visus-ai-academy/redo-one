import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { IdCriadoDto } from '../../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { Dono, TipoDono } from '../../application/ports/precos.repository';
import {
  ExportarPrecos,
  HistoricoPreco,
  ListarPrecos,
  MudarPrecos,
  OpcoesPrecos,
} from '../../application/use-cases/precos';
import type { DadosPreco } from '../../domain/versoes-preco';
import {
  ArranjoPrecoDto,
  EncerrarPrecoDto,
  ImportarPrecosDto,
  ListarPrecosQueryDto,
  MudarPrecoDto,
  OpcoesPrecoDto,
  PlanilhaPrecosDto,
  ResultadoImportacaoPrecosDto,
  TabelaPrecosDto,
  TIPOS_DONO,
  VersaoHistoricoDto,
} from './dto/precos.dto';

const dadosDo = (d: MudarPrecoDto): DadosPreco => ({
  modalidadeId: d.modalidadeId,
  especialidadeId: d.especialidadeId,
  categoriaId: d.categoriaId,
  prioridadeId: d.prioridadeId,
  faixaInicio: d.faixaInicio,
  faixaFim: d.faixaFim,
  condVolume: d.condVolume,
  valor: d.valor,
});

const tipoPipe = new ParseEnumPipe(
  Object.fromEntries(TIPOS_DONO.map((t) => [t, t])) as Record<TipoDono, TipoDono>,
);
const TIPO = {
  name: 'tipo',
  enum: TIPOS_DONO,
  description: 'Tabela do cliente ou padrão do contratado.',
};
const INVALIDO =
  'Valor, faixa ou "vale a partir de" inválido: só competência aberta ou futura, depois de toda fechada ou travada.';
const CONFLITO = 'Arranjo e faixa já com preço no período, ou alterado por outra pessoa no meio.';

/**
 * Preços do cliente (aba Preços) e tabela padrão do contratado (Configurações › Faturamento).
 * Nada se sobrescreve: alterar e excluir encerram a versão e criam outra a partir da competência
 * escolhida.
 */
@ApiTags('faturamento')
@Controller('faturamento/precos')
export class PrecosController {
  constructor(
    private readonly listarCaso: ListarPrecos,
    private readonly historicoCaso: HistoricoPreco,
    private readonly mudarCaso: MudarPrecos,
    private readonly exportarCaso: ExportarPrecos,
    private readonly opcoesCaso: OpcoesPrecos,
  ) {}

  @Get('opcoes')
  @Permissao('faturamento.ver')
  @ApiOkResponse({ type: OpcoesPrecoDto, description: 'Cadastros ativos para o editor.' })
  opcoes(): Promise<OpcoesPrecoDto> {
    return this.opcoesCaso.executar();
  }

  @Get(':tipo/:donoId')
  @Permissao('faturamento.ver')
  @ApiParam(TIPO)
  @ApiOkResponse({ type: TabelaPrecosDto, description: 'Versões em vigor e programadas.' })
  @ApiNotFoundResponse({ description: 'Cliente ou contratado não encontrado.' })
  async listar(
    @Param('tipo', tipoPipe) tipo: TipoDono,
    @Param('donoId', ParseUUIDPipe) donoId: string,
    @Query() query: ListarPrecosQueryDto,
  ): Promise<TabelaPrecosDto> {
    const paginacao = { pagina: query.pagina, porPagina: query.porPagina };
    return {
      ...(await this.listarCaso.executar(
        { tipo, id: donoId },
        { ...paginacao, busca: query.busca },
      )),
      ...paginacao,
    };
  }

  @Get(':tipo/:donoId/historico')
  @Permissao('faturamento.ver')
  @ApiParam(TIPO)
  @ApiOkResponse({ type: [VersaoHistoricoDto], description: 'Todas as versões do arranjo.' })
  @ApiNotFoundResponse({ description: 'Cliente ou contratado não encontrado.' })
  historico(
    @Param('tipo', tipoPipe) tipo: TipoDono,
    @Param('donoId', ParseUUIDPipe) donoId: string,
    @Query() arranjo: ArranjoPrecoDto,
  ): Promise<VersaoHistoricoDto[]> {
    return this.historicoCaso.executar({ tipo, id: donoId }, arranjo);
  }

  @Get(':tipo/:donoId/exportar')
  @Permissao('faturamento.ver')
  @ApiParam(TIPO)
  @ApiOkResponse({ type: PlanilhaPrecosDto, description: 'A tabela em vigor no mês atual.' })
  @ApiNotFoundResponse({ description: 'Cliente ou contratado não encontrado.' })
  exportar(
    @Param('tipo', tipoPipe) tipo: TipoDono,
    @Param('donoId', ParseUUIDPipe) donoId: string,
  ): Promise<PlanilhaPrecosDto> {
    return this.exportarCaso.executar({ tipo, id: donoId });
  }

  @Post(':tipo/:donoId')
  @Permissao('faturamento.precos.editar')
  @ApiParam(TIPO)
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: CONFLITO })
  @ApiNotFoundResponse({ description: 'Cliente ou contratado não encontrado.' })
  async incluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('tipo', tipoPipe) tipo: TipoDono,
    @Param('donoId', ParseUUIDPipe) donoId: string,
    @Body() corpo: MudarPrecoDto,
  ): Promise<IdCriadoDto> {
    const dono: Dono = { tipo, id: donoId };
    return {
      id: await this.mudarCaso.incluir(ator.usuarioId, dono, dadosDo(corpo), corpo.aPartirDe),
    };
  }

  @Put(':tipo/:donoId/:precoId')
  @Permissao('faturamento.precos.editar')
  @ApiParam(TIPO)
  @ApiOkResponse({ type: IdCriadoDto, description: 'A versão nova; a anterior foi encerrada.' })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: CONFLITO })
  @ApiNotFoundResponse({ description: 'Preço, cliente ou contratado não encontrado.' })
  async alterar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('tipo', tipoPipe) tipo: TipoDono,
    @Param('donoId', ParseUUIDPipe) donoId: string,
    @Param('precoId', ParseUUIDPipe) precoId: string,
    @Body() corpo: MudarPrecoDto,
  ): Promise<IdCriadoDto> {
    const id = await this.mudarCaso.alterar(
      ator.usuarioId,
      { tipo, id: donoId },
      precoId,
      dadosDo(corpo),
      corpo.aPartirDe,
    );
    return { id };
  }

  @Post(':tipo/:donoId/:precoId/encerrar')
  @Permissao('faturamento.precos.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam(TIPO)
  @ApiNoContentResponse({
    description: 'Encerrado (a versão programada que nunca valeu é apagada).',
  })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: CONFLITO })
  @ApiNotFoundResponse({ description: 'Preço, cliente ou contratado não encontrado.' })
  encerrar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('tipo', tipoPipe) tipo: TipoDono,
    @Param('donoId', ParseUUIDPipe) donoId: string,
    @Param('precoId', ParseUUIDPipe) precoId: string,
    @Body() corpo: EncerrarPrecoDto,
  ): Promise<void> {
    return this.mudarCaso.encerrar(ator.usuarioId, { tipo, id: donoId }, precoId, corpo.aPartirDe);
  }

  @Post(':tipo/:donoId/importar')
  @Permissao('faturamento.precos.editar')
  @HttpCode(HttpStatus.OK)
  @ApiParam(TIPO)
  @ApiOkResponse({ type: ResultadoImportacaoPrecosDto })
  @ApiBadRequestResponse({
    description: 'Planilha com problema (`erros` traz a linha e o motivo); nada foi importado.',
  })
  @ApiConflictResponse({ description: CONFLITO })
  @ApiNotFoundResponse({ description: 'Cliente ou contratado não encontrado.' })
  importar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('tipo', tipoPipe) tipo: TipoDono,
    @Param('donoId', ParseUUIDPipe) donoId: string,
    @Body() corpo: ImportarPrecosDto,
  ): Promise<ResultadoImportacaoPrecosDto> {
    return this.mudarCaso.importar(
      ator.usuarioId,
      { tipo, id: donoId },
      corpo.conteudo,
      corpo.aPartirDe,
    );
  }
}
