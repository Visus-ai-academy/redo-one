import {
  Body,
  Controller,
  Delete,
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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { IdCriadoDto } from '../../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import {
  ConsultarCategorias,
  ExcluirCategoria,
  SalvarCategoria,
} from '../../application/use-cases/categorias';
import {
  CategoriaDto,
  CategoriaItemDto,
  ListarCategoriasDto,
  OpcoesCategoriasDto,
  PaginaCategoriasDto,
} from './dto/categoria.dto';

const INVALIDA =
  'Nome vazio ou grupo inválido (de outro tipo, dentro de outro grupo ou inexistente); `campos` diz qual.';

/** Configurações › Financeiro › Categorias financeiras: o plano de receitas e despesas. */
@ApiTags('financeiro')
@Controller('financeiro/categorias')
export class CategoriasFinanceirasController {
  constructor(
    private readonly consultar: ConsultarCategorias,
    private readonly salvar: SalvarCategoria,
    private readonly excluirCaso: ExcluirCategoria,
  ) {}

  @Get()
  @Permissao('categorias-financeiras.ver')
  @ApiOkResponse({
    type: PaginaCategoriasDto,
    description: 'Em árvore: cada grupo e as categorias dele.',
  })
  async listar(@Query() query: ListarCategoriasDto): Promise<PaginaCategoriasDto> {
    const { itens, total } = await this.consultar.listar({
      tipo: query.tipo,
      situacao: query.situacao,
      busca: query.busca,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get('opcoes')
  @Permissao('categorias-financeiras.ver')
  @ApiOkResponse({ type: [CategoriaItemDto], description: 'As ativas, em árvore, para escolher.' })
  opcoes(@Query() query: OpcoesCategoriasDto): Promise<CategoriaItemDto[]> {
    return this.consultar.opcoes(query.tipo);
  }

  @Get(':id')
  @Permissao('categorias-financeiras.ver')
  @ApiOkResponse({ type: CategoriaItemDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<CategoriaItemDto> {
    return this.consultar.obter(id);
  }

  @Post()
  @Permissao('categorias-financeiras.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: INVALIDA })
  @ApiConflictResponse({ description: 'Já existe uma categoria com o nome no mesmo grupo.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: CategoriaDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.salvar.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('categorias-financeiras.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: INVALIDA })
  @ApiConflictResponse({ description: 'Já existe uma categoria com o nome no mesmo grupo.' })
  @ApiNotFoundResponse()
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: CategoriaDto,
  ): Promise<void> {
    return this.salvar.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('categorias-financeiras.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description: 'Em uso (categorias dentro, fornecedores ou títulos): desative.',
  })
  @ApiNotFoundResponse()
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.excluirCaso.executar({ usuarioId: ator.usuarioId }, id);
  }
}
