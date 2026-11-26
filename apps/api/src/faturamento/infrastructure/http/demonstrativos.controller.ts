import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao } from '../../../identidade/acesso/decorators';
import {
  DetalharLaudoDemonstrativo,
  ListarDemonstrativos,
  ObterDemonstrativo,
} from '../../application/use-cases/consultar-demonstrativos';
import {
  DemonstrativoClienteDto,
  DemonstrativoClienteParamDto,
  DetalheLaudoDto,
  ListarDemonstrativosQueryDto,
  PaginaDemonstrativosDto,
  VersaoQueryDto,
} from './dto/demonstrativos.dto';

/** Leitura do demonstrativo de faturamento (prévia na aberta, versão gravada na fechada). */
@ApiTags('faturamento')
@Controller('faturamento/demonstrativos')
export class DemonstrativosController {
  constructor(
    private readonly listarCaso: ListarDemonstrativos,
    private readonly obterCaso: ObterDemonstrativo,
    private readonly detalharCaso: DetalharLaudoDemonstrativo,
  ) {}

  @Get()
  @Permissao('faturamento.ver')
  @ApiOkResponse({
    type: PaginaDemonstrativosDto,
    description: 'Os vigentes, pelo nome do cliente.',
  })
  @ApiBadRequestResponse()
  async listar(@Query() q: ListarDemonstrativosQueryDto): Promise<PaginaDemonstrativosDto> {
    const paginacao = { pagina: q.pagina, porPagina: q.porPagina };
    return { ...(await this.listarCaso.executar(q.competencia, paginacao)), ...paginacao };
  }

  @Get('laudos/:laudoId')
  @Permissao('faturamento.ver')
  @ApiOkResponse({
    type: DetalheLaudoDto,
    description:
      'O cálculo do laudo feito agora (situação e cada parcela com o preço); na fechada, o que o recálculo daria.',
  })
  @ApiNotFoundResponse()
  laudo(@Param('laudoId', ParseUUIDPipe) laudoId: string): Promise<DetalheLaudoDto> {
    return this.detalharCaso.executar(laudoId);
  }

  @Get(':competencia/clientes/:clienteId')
  @Permissao('faturamento.ver')
  @ApiOkResponse({ type: DemonstrativoClienteDto })
  @ApiNotFoundResponse()
  cliente(
    @Param() p: DemonstrativoClienteParamDto,
    @Query() q: VersaoQueryDto,
  ): Promise<DemonstrativoClienteDto> {
    return this.obterCaso.executar(p.competencia, p.clienteId, q.versao);
  }
}
