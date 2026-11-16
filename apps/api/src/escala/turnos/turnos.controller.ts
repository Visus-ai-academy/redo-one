import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
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
  ApiTags,
} from '@nestjs/swagger';

import { IdCriadoDto, ListarDto } from '../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { AvisosTurnoDto, PaginaTurnosDto, TurnoDto, TurnoItemDto } from './dto/turno.dto';
import { TurnosService } from './turnos.service';

/** Leitura com `escala.ver`: os turnos alimentam as telas da escala, não só a de configuração. */
@ApiTags('escala')
@Controller('escala/turnos')
export class TurnosController {
  constructor(@Inject(TurnosService) private readonly service: TurnosService) {}

  @Get()
  @Permissao('escala.ver')
  @ApiOkResponse({ type: PaginaTurnosDto })
  async listar(@Query() query: ListarDto): Promise<PaginaTurnosDto> {
    const { itens, total } = await this.service.listar({
      busca: query.busca,
      ativo: query.ativo,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get(':id')
  @Permissao('escala.ver')
  @ApiOkResponse({ type: TurnoItemDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<TurnoItemDto> {
    return this.service.obter(id);
  }

  @Post()
  @Permissao('escala-config.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({
    description: 'Horário inválido, ou especialidade ou modalidade inexistente no catálogo.',
  })
  @ApiConflictResponse({ description: 'Nome já usado.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: TurnoDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('escala-config.editar')
  @ApiOkResponse({
    type: AvisosTurnoDto,
    description: 'Salvo. `avisos` não bloqueiam (ex.: inativado com alocações vigentes).',
  })
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({
    description: 'Horário inválido, ou especialidade ou modalidade inexistente no catálogo.',
  })
  @ApiConflictResponse({
    description:
      'Nome já usado, ou a mudança deixaria alocações vigentes fora do horário ou de uma frente que saiu.',
  })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: TurnoDto,
  ): Promise<AvisosTurnoDto> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('escala-config.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: 'Em uso por alocação, ausência ou recorte de gestora: desative.',
  })
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}
