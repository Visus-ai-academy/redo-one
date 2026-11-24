import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { IdCriadoDto } from '../../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { VigenciaRegistrada } from '../../application/ports/cortes.repository';
import { CriarCorte } from '../../application/use-cases/criar-corte';
import { ListarCortes } from '../../application/use-cases/listar-cortes';
import type { PedidoVigencia } from '../../application/use-cases/preparar-vigencia';
import { PreviaCorte } from '../../application/use-cases/previa-corte';
import { camposDoCorte } from '../../domain/vigencia-corte';
import {
  ListarCortesQueryDto,
  NovaVigenciaCorteDto,
  PreviaCorteDto,
  VigenciaCorteDto,
} from './dto/corte.dto';

const pedidoDo = (d: NovaVigenciaCorteDto): PedidoVigencia => ({
  clienteId: d.clienteId,
  desde: d.desde,
  usaPadrao: d.usaPadrao,
  dia: d.dia,
  ultimoDia: d.ultimoDia,
  mes: d.mes,
  consideraExame: d.consideraExame,
});

const vigenciaParaDto = ({ corte, ...v }: VigenciaRegistrada): VigenciaCorteDto => ({
  ...v,
  ...camposDoCorte(corte),
});

const ERROS_VIGENCIA = {
  bad: 'Corte incompleto, "usa o padrão" sem cliente, ou `desde` na última competência fechada ou antes dela.',
  conflito: 'Já existe uma vigência a partir de `desde`.',
};

/** Corte da competência: o padrão (sem cliente) e o de cada cliente, por vigências. */
@ApiTags('faturamento')
@Controller('faturamento/cortes')
export class CortesController {
  constructor(
    private readonly listarCaso: ListarCortes,
    private readonly previaCaso: PreviaCorte,
    private readonly criarCaso: CriarCorte,
  ) {}

  @Get()
  @Permissao('faturamento.ver')
  @ApiOkResponse({ type: [VigenciaCorteDto], description: 'A vigência mais nova primeiro.' })
  async listar(@Query() query: ListarCortesQueryDto): Promise<VigenciaCorteDto[]> {
    return (await this.listarCaso.executar(query.clienteId ?? null)).map(vigenciaParaDto);
  }

  @Post('previa')
  @Permissao('faturamento.corte.editar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: PreviaCorteDto,
    description: 'Quantos laudos das competências abertas mudariam, sem gravar nada.',
  })
  @ApiBadRequestResponse({ description: ERROS_VIGENCIA.bad })
  @ApiNotFoundResponse({ description: 'Cliente não encontrado.' })
  @ApiConflictResponse({ description: ERROS_VIGENCIA.conflito })
  previa(@Body() corpo: NovaVigenciaCorteDto): Promise<PreviaCorteDto> {
    return this.previaCaso.executar(pedidoDo(corpo));
  }

  @Post()
  @Permissao('faturamento.corte.editar')
  @ApiCreatedResponse({
    type: IdCriadoDto,
    description: 'Vigência criada; o recálculo dos laudos atingidos vai para a fila.',
  })
  @ApiBadRequestResponse({ description: ERROS_VIGENCIA.bad })
  @ApiNotFoundResponse({ description: 'Cliente não encontrado.' })
  @ApiConflictResponse({ description: ERROS_VIGENCIA.conflito })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: NovaVigenciaCorteDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.criarCaso.executar(ator.usuarioId, pedidoDo(corpo)) };
  }
}
