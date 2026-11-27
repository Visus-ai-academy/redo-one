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
  type Type,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { IdCriadoDto } from '../../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import {
  BaixasTitulo,
  CancelarTitulo,
  ConsultarTitulos,
  OpcoesDeFavorecido,
  SalvarTitulo,
} from '../../application/use-cases/titulos';
import type { TipoTitulo } from '../../domain/titulo';
import {
  BaixaDto,
  ListarFavorecidosDto,
  ListarTitulosDto,
  MotivoDto,
  OpcaoFavorecidoDto,
  PaginaTitulosDto,
  ProrrogacaoDto,
  TituloDetalheDto,
  TituloDto,
} from './dto/titulo.dto';

const TODAS = 'todas';
const INVALIDO = 'Algum campo inválido; `campos` diz qual e por quê.';

/** A tela e o nome de cada tipo de título: as permissões e as rotas são separadas. */
export const TELA_DO_TIPO = {
  pagar: { tela: 'contas-pagar', classe: 'ContasPagar' },
  receber: { tela: 'contas-receber', classe: 'ContasReceber' },
} as const satisfies Record<TipoTitulo, { tela: string; classe: string }>;

/**
 * Contas a pagar e Contas a receber: a mesma regra e as mesmas rotas, cada uma com a sua
 * permissão (`contas-pagar.*`, `contas-receber.*`). O controller é montado para cada tipo.
 */
export function criarTitulosController(tipo: TipoTitulo): Type<unknown> {
  const { tela, classe } = TELA_DO_TIPO[tipo];
  const nome = `${classe}TitulosController`;
  const operacao = (metodo: string, summary: string) =>
    ApiOperation({ operationId: `${nome}_${metodo}`, summary });

  @ApiTags('financeiro')
  @Controller(`financeiro/${tela}`)
  class TitulosController {
    constructor(
      readonly consultar: ConsultarTitulos,
      readonly salvar: SalvarTitulo,
      readonly baixas: BaixasTitulo,
      readonly cancelarCaso: CancelarTitulo,
      readonly favorecidos: OpcoesDeFavorecido,
    ) {}

    @Get('titulos')
    @Permissao(`${tela}.ver`)
    @operacao('listar', 'Títulos, por vencimento, com os totais em aberto e vencido.')
    @ApiOkResponse({ type: PaginaTitulosDto })
    async listar(@Query() query: ListarTitulosDto): Promise<PaginaTitulosDto> {
      const pagina = await this.consultar.listar({
        tipo,
        empresa: query.empresa === TODAS ? TODAS : { id: query.empresa },
        situacao: query.situacao,
        origem: query.origem,
        categoria: query.categoria === TODAS ? TODAS : { id: query.categoria },
        favorecido:
          query.favorecidoTipo && query.favorecidoId
            ? { tipo: query.favorecidoTipo, id: query.favorecidoId }
            : undefined,
        vencimentoDe: query.vencimentoDe,
        vencimentoAte: query.vencimentoAte,
        busca: query.busca,
        pagina: query.pagina,
        porPagina: query.porPagina,
      });
      return { ...pagina, pagina: query.pagina, porPagina: query.porPagina };
    }

    @Get('favorecidos')
    @Permissao(`${tela}.ver`)
    @operacao(
      'favorecidos',
      tipo === 'receber'
        ? 'Clientes principais ativos para o título.'
        : 'Fornecedores e médicos ativos para o título.',
    )
    @ApiOkResponse({ type: [OpcaoFavorecidoDto] })
    listarFavorecidos(@Query() query: ListarFavorecidosDto): Promise<OpcaoFavorecidoDto[]> {
      return this.favorecidos.listar(tipo, query.busca);
    }

    @Get('titulos/:id')
    @Permissao(`${tela}.ver`)
    @operacao('obter', 'O título, com as baixas (estornadas inclusive).')
    @ApiOkResponse({ type: TituloDetalheDto })
    @ApiNotFoundResponse()
    obter(@Param('id', ParseUUIDPipe) id: string): Promise<TituloDetalheDto> {
      return this.consultar.obter(tipo, id);
    }

    @Post('titulos')
    @Permissao(`${tela}.criar`)
    @operacao('criar', 'Lança o título à mão.')
    @ApiCreatedResponse({ type: IdCriadoDto })
    @ApiBadRequestResponse({ description: INVALIDO })
    async criar(
      @PrincipalAtual() ator: PrincipalUsuario,
      @Body() corpo: TituloDto,
    ): Promise<IdCriadoDto> {
      return { id: await this.salvar.criar(tipo, { usuarioId: ator.usuarioId }, corpo) };
    }

    @Put('titulos/:id')
    @Permissao(`${tela}.editar`)
    @operacao('atualizar', 'Edita o título em aberto ou parcial.')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse()
    @ApiBadRequestResponse({ description: INVALIDO })
    @ApiConflictResponse({ description: 'Título liquidado ou cancelado.' })
    @ApiNotFoundResponse()
    atualizar(
      @PrincipalAtual() ator: PrincipalUsuario,
      @Param('id', ParseUUIDPipe) id: string,
      @Body() corpo: TituloDto,
    ): Promise<void> {
      return this.salvar.atualizar(tipo, { usuarioId: ator.usuarioId }, id, corpo);
    }

    @Post('titulos/:id/prorrogacao')
    @Permissao(`${tela}.editar`)
    @operacao('prorrogar', 'Novo vencimento, com motivo; o original fica guardado.')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse()
    @ApiBadRequestResponse({ description: INVALIDO })
    @ApiConflictResponse({ description: 'Título liquidado ou cancelado.' })
    @ApiNotFoundResponse()
    prorrogar(
      @PrincipalAtual() ator: PrincipalUsuario,
      @Param('id', ParseUUIDPipe) id: string,
      @Body() corpo: ProrrogacaoDto,
    ): Promise<void> {
      return this.salvar.prorrogar(
        tipo,
        { usuarioId: ator.usuarioId },
        id,
        corpo.vencimento,
        corpo.motivo,
      );
    }

    @Post('titulos/:id/baixas')
    @Permissao(`${tela}.baixar`)
    @operacao('baixar', 'Dá baixa (total ou parcial) numa conta bancária da empresa.')
    @ApiCreatedResponse({ type: IdCriadoDto, description: 'O id da baixa.' })
    @ApiBadRequestResponse({ description: INVALIDO })
    @ApiConflictResponse({ description: 'Título liquidado ou cancelado.' })
    @ApiNotFoundResponse()
    async baixar(
      @PrincipalAtual() ator: PrincipalUsuario,
      @Param('id', ParseUUIDPipe) id: string,
      @Body() corpo: BaixaDto,
    ): Promise<IdCriadoDto> {
      return { id: await this.baixas.baixar(tipo, { usuarioId: ator.usuarioId }, id, corpo) };
    }

    @Post('titulos/:id/baixas/:baixaId/estorno')
    @Permissao(`${tela}.estornar`)
    @operacao('estornar', 'Estorna a baixa, com motivo; o título volta a ter saldo.')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse()
    @ApiBadRequestResponse({ description: 'Motivo faltando.' })
    @ApiConflictResponse({ description: 'A baixa já foi estornada.' })
    @ApiNotFoundResponse()
    estornar(
      @PrincipalAtual() ator: PrincipalUsuario,
      @Param('id', ParseUUIDPipe) id: string,
      @Param('baixaId', ParseUUIDPipe) baixaId: string,
      @Body() corpo: MotivoDto,
    ): Promise<void> {
      return this.baixas.estornar(tipo, { usuarioId: ator.usuarioId }, id, baixaId, corpo.motivo);
    }

    @Post('titulos/:id/cancelamento')
    @Permissao(`${tela}.cancelar`)
    @operacao('cancelar', 'Cancela o título sem baixa ativa, com motivo.')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse()
    @ApiBadRequestResponse({ description: 'Motivo faltando.' })
    @ApiConflictResponse({ description: 'Com baixa ativa ou já cancelado.' })
    @ApiNotFoundResponse()
    cancelar(
      @PrincipalAtual() ator: PrincipalUsuario,
      @Param('id', ParseUUIDPipe) id: string,
      @Body() corpo: MotivoDto,
    ): Promise<void> {
      return this.cancelarCaso.executar(tipo, { usuarioId: ator.usuarioId }, id, corpo.motivo);
    }
  }

  Object.defineProperty(TitulosController, 'name', { value: nome });
  return TitulosController;
}

export const ContasPagarTitulosController = criarTitulosController('pagar');
export const ContasReceberTitulosController = criarTitulosController('receber');
