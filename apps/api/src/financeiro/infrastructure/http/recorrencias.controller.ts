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
  AcoesRecorrencia,
  ConsultarRecorrencias,
  SalvarRecorrencia,
} from '../../application/use-cases/recorrencias';
import type { TipoTitulo } from '../../domain/titulo';
import {
  AgendaRecorrenciaDto,
  EditarRecorrenciaDto,
  ListarRecorrenciasDto,
  PaginaRecorrenciasDto,
  PreviaRecorrenciaDto,
  RecorrenciaCriadaDto,
  RecorrenciaDetalheDto,
  RecorrenciaDto,
  RecorrenciaEditadaDto,
  RecorrenciaRetomadaDto,
  TituloAjustavelDto,
} from './dto/recorrencia.dto';
import { MotivoDto } from './dto/titulo.dto';
import { TELA_DO_TIPO } from './titulos.controller';

const TODAS = 'todas';
const INVALIDO = 'Algum campo inválido; `campos` diz qual e por quê.';

/**
 * Aba Recorrentes de Contas a pagar e de Contas a receber, com as permissões do tipo (`criar`,
 * `editar`; encerrar usa `cancelar`). O controller é montado para cada tipo.
 */
export function criarRecorrenciasController(tipo: TipoTitulo): Type<unknown> {
  const { tela, classe } = TELA_DO_TIPO[tipo];
  const nome = `${classe}RecorrenciasController`;
  const operacao = (metodo: string, summary: string) =>
    ApiOperation({ operationId: `${nome}_${metodo}`, summary });

  @ApiTags('financeiro')
  @Controller(`financeiro/${tela}/recorrencias`)
  class RecorrenciasController {
    constructor(
      readonly consultar: ConsultarRecorrencias,
      readonly salvar: SalvarRecorrencia,
      readonly acoes: AcoesRecorrencia,
    ) {}

    @Get()
    @Permissao(`${tela}.ver`)
    @operacao('listar', 'Recorrências, ativas primeiro, com o previsto por mês das ativas.')
    @ApiOkResponse({ type: PaginaRecorrenciasDto })
    async listar(@Query() query: ListarRecorrenciasDto): Promise<PaginaRecorrenciasDto> {
      const pagina = await this.consultar.listar({
        tipo,
        empresa: query.empresa === TODAS ? TODAS : { id: query.empresa },
        situacao: query.situacao,
        frequencia: query.frequencia,
        busca: query.busca,
        pagina: query.pagina,
        porPagina: query.porPagina,
      });
      return { ...pagina, pagina: query.pagina, porPagina: query.porPagina };
    }

    @Post('previa')
    @Permissao(`${tela}.criar`)
    @operacao('previa', 'Os vencimentos que a recorrência geraria agora.')
    @HttpCode(HttpStatus.OK)
    @ApiOkResponse({ type: PreviaRecorrenciaDto })
    previa(@Body() corpo: AgendaRecorrenciaDto): Promise<PreviaRecorrenciaDto> {
      return this.consultar.previa(corpo);
    }

    @Get(':id')
    @Permissao(`${tela}.ver`)
    @operacao('obter', 'A recorrência, com o ajuste que vale e o próximo a gerar.')
    @ApiOkResponse({ type: RecorrenciaDetalheDto })
    @ApiNotFoundResponse()
    obter(@Param('id', ParseUUIDPipe) id: string): Promise<RecorrenciaDetalheDto> {
      return this.consultar.obter(tipo, id);
    }

    @Get(':id/titulos-ajustaveis')
    @Permissao(`${tela}.editar`)
    @operacao(
      'ajustaveis',
      'Títulos gerados em aberto, sem baixa e não editados à mão: os que a edição pode mudar.',
    )
    @ApiOkResponse({ type: [TituloAjustavelDto] })
    @ApiNotFoundResponse()
    ajustaveis(@Param('id', ParseUUIDPipe) id: string): Promise<TituloAjustavelDto[]> {
      return this.consultar.ajustaveis(tipo, id);
    }

    @Post()
    @Permissao(`${tela}.criar`)
    @operacao('criar', 'Cria a recorrência e gera os títulos até o horizonte.')
    @ApiCreatedResponse({ type: RecorrenciaCriadaDto })
    @ApiBadRequestResponse({ description: INVALIDO })
    criar(
      @PrincipalAtual() ator: PrincipalUsuario,
      @Body() corpo: RecorrenciaDto,
    ): Promise<RecorrenciaCriadaDto> {
      return this.salvar.criar(tipo, { usuarioId: ator.usuarioId }, corpo);
    }

    @Put(':id')
    @Permissao(`${tela}.editar`)
    @operacao('atualizar', 'Edita a recorrência; com `aplicarAosGerados`, os ajustáveis também.')
    @ApiOkResponse({ type: RecorrenciaEditadaDto })
    @ApiBadRequestResponse({ description: INVALIDO })
    @ApiConflictResponse({ description: 'Recorrência encerrada.' })
    @ApiNotFoundResponse()
    atualizar(
      @PrincipalAtual() ator: PrincipalUsuario,
      @Param('id', ParseUUIDPipe) id: string,
      @Body() { aplicarAosGerados, ...corpo }: EditarRecorrenciaDto,
    ): Promise<RecorrenciaEditadaDto> {
      return this.salvar.atualizar(
        tipo,
        { usuarioId: ator.usuarioId },
        id,
        corpo,
        aplicarAosGerados,
      );
    }

    @Post(':id/pausa')
    @Permissao(`${tela}.editar`)
    @operacao('pausar', 'Pausa: não gera enquanto estiver pausada.')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse()
    @ApiConflictResponse({ description: 'Não está ativa.' })
    @ApiNotFoundResponse()
    pausar(
      @PrincipalAtual() ator: PrincipalUsuario,
      @Param('id', ParseUUIDPipe) id: string,
    ): Promise<void> {
      return this.acoes.pausar(tipo, { usuarioId: ator.usuarioId }, id);
    }

    @Post(':id/retomada')
    @Permissao(`${tela}.editar`)
    @operacao('retomar', 'Retoma a partir de hoje (o que venceu na pausa não é gerado).')
    @HttpCode(HttpStatus.OK)
    @ApiOkResponse({ type: RecorrenciaRetomadaDto })
    @ApiConflictResponse({ description: 'Não está pausada.' })
    @ApiNotFoundResponse()
    retomar(
      @PrincipalAtual() ator: PrincipalUsuario,
      @Param('id', ParseUUIDPipe) id: string,
    ): Promise<RecorrenciaRetomadaDto> {
      return this.acoes.retomar(tipo, { usuarioId: ator.usuarioId }, id);
    }

    @Post(':id/encerramento')
    @Permissao(`${tela}.cancelar`)
    @operacao('encerrar', 'Encerra com motivo; os títulos em aberto ficam.')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse()
    @ApiBadRequestResponse({ description: 'Motivo faltando.' })
    @ApiConflictResponse({ description: 'Já encerrada.' })
    @ApiNotFoundResponse()
    encerrar(
      @PrincipalAtual() ator: PrincipalUsuario,
      @Param('id', ParseUUIDPipe) id: string,
      @Body() corpo: MotivoDto,
    ): Promise<void> {
      return this.acoes.encerrar(tipo, { usuarioId: ator.usuarioId }, id, corpo.motivo);
    }

    @Post(':id/proximo')
    @Permissao(`${tela}.criar`)
    @operacao('gerarProximo', 'Gera o próximo título agora, mesmo além do horizonte.')
    @ApiCreatedResponse({ type: IdCriadoDto, description: 'O id do título gerado.' })
    @ApiConflictResponse({ description: 'Não está ativa ou já gerou tudo do término.' })
    @ApiNotFoundResponse()
    async gerarProximo(
      @PrincipalAtual() ator: PrincipalUsuario,
      @Param('id', ParseUUIDPipe) id: string,
    ): Promise<IdCriadoDto> {
      return { id: await this.acoes.gerarProximo(tipo, { usuarioId: ator.usuarioId }, id) };
    }
  }

  Object.defineProperty(RecorrenciasController, 'name', { value: nome });
  return RecorrenciasController;
}

export const ContasPagarRecorrenciasController = criarRecorrenciasController('pagar');
export const ContasReceberRecorrenciasController = criarRecorrenciasController('receber');
