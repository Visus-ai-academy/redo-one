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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { IdCriadoDto, ListarDto } from '../comum/dto';
import {
  ItemListaDto,
  ListaDto,
  PaginaListaDto,
  PaginaPrioridadesDto,
  PrioridadeDto,
  PrioridadeItemDto,
} from './dto/lista.dto';
import type { DadosPrioridade } from './lista.repository';
import type { ListaService } from './listas.service';
import { CATEGORIAS_EXAME, ESPECIALIDADES, MODALIDADES, PRIORIDADES } from './tokens';

/**
 * Rotas comuns às listas do catálogo. Cada lista herda e só declara a rota e o service; a
 * prioridade redeclara os métodos que têm o campo `urgente`.
 */
abstract class ListaControllerBase {
  constructor(protected readonly service: ListaService) {}

  @Get()
  @Permissao('catalogo.ver')
  @ApiOkResponse({ type: PaginaListaDto })
  async listar(@Query() query: ListarDto): Promise<PaginaListaDto> {
    const { itens, total } = await this.service.listar({
      busca: query.busca,
      ativo: query.ativo,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get(':id')
  @Permissao('catalogo.ver')
  @ApiOkResponse({ type: ItemListaDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<ItemListaDto> {
    return this.service.obter(id);
  }

  @Post()
  @Permissao('catalogo.editar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiConflictResponse({ description: 'Nome já usado.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: ListaDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('catalogo.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Nome já usado.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: ListaDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('catalogo.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Em uso por outro cadastro: desative em vez de excluir.' })
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}

@ApiTags('catalogo')
@Controller('catalogo/modalidades')
export class ModalidadesController extends ListaControllerBase {
  constructor(@Inject(MODALIDADES) service: ListaService) {
    super(service);
  }
}

@ApiTags('catalogo')
@Controller('catalogo/especialidades')
export class EspecialidadesController extends ListaControllerBase {
  constructor(@Inject(ESPECIALIDADES) service: ListaService) {
    super(service);
  }
}

@ApiTags('catalogo')
@Controller('catalogo/categorias-exame')
export class CategoriasExameController extends ListaControllerBase {
  constructor(@Inject(CATEGORIAS_EXAME) service: ListaService) {
    super(service);
  }
}

@ApiTags('catalogo')
@Controller('catalogo/prioridades')
export class PrioridadesController extends ListaControllerBase {
  constructor(@Inject(PRIORIDADES) private readonly prioridades: ListaService<DadosPrioridade>) {
    super(prioridades as unknown as ListaService);
  }

  @Get()
  @Permissao('catalogo.ver')
  @ApiOkResponse({ type: PaginaPrioridadesDto })
  override listar(@Query() query: ListarDto): Promise<PaginaPrioridadesDto> {
    return super.listar(query) as Promise<PaginaPrioridadesDto>;
  }

  @Get(':id')
  @Permissao('catalogo.ver')
  @ApiOkResponse({ type: PrioridadeItemDto })
  @ApiNotFoundResponse()
  override obter(@Param('id', ParseUUIDPipe) id: string): Promise<PrioridadeItemDto> {
    return this.prioridades.obter(id);
  }

  @Post()
  @Permissao('catalogo.editar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiConflictResponse({ description: 'Nome já usado.' })
  override async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: PrioridadeDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.prioridades.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('catalogo.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Nome já usado.' })
  override atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: PrioridadeDto,
  ): Promise<void> {
    return this.prioridades.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }
}
