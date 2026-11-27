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
  ConsultarFornecedores,
  ExcluirFornecedor,
  SalvarFornecedor,
} from '../../application/use-cases/fornecedores';
import {
  FornecedorDetalheDto,
  FornecedorDto,
  ListarFornecedoresDto,
  PaginaFornecedoresDto,
} from './dto/fornecedor.dto';

const INVALIDO =
  'Razão social ou documento faltando, e-mail, telefone, endereço, Pix ou categoria inválidos; `campos` diz qual.';

/** Cadastros › Fornecedores: a quem a empresa paga e que não é médico. */
@ApiTags('financeiro')
@Controller('financeiro/fornecedores')
export class FornecedoresController {
  constructor(
    private readonly consultar: ConsultarFornecedores,
    private readonly salvar: SalvarFornecedor,
    private readonly excluirCaso: ExcluirFornecedor,
  ) {}

  @Get()
  @Permissao('fornecedores.ver')
  @ApiOkResponse({
    type: PaginaFornecedoresDto,
    description: 'O CPF vem só com os dois últimos dígitos.',
  })
  async listar(@Query() query: ListarFornecedoresDto): Promise<PaginaFornecedoresDto> {
    const { itens, total } = await this.consultar.listar({
      categoria: query.categoria === 'todas' ? 'todas' : { id: query.categoria },
      situacao: query.situacao,
      busca: query.busca,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get(':id')
  @Permissao('fornecedores.ver')
  @ApiOkResponse({ type: FornecedorDetalheDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<FornecedorDetalheDto> {
    return this.consultar.obter(id);
  }

  @Post()
  @Permissao('fornecedores.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: 'CNPJ ou CPF de outro fornecedor.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: FornecedorDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.salvar.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('fornecedores.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: 'CNPJ ou CPF de outro fornecedor.' })
  @ApiNotFoundResponse()
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: FornecedorDto,
  ): Promise<void> {
    return this.salvar.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('fornecedores.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Com títulos lançados: desative.' })
  @ApiNotFoundResponse()
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.excluirCaso.executar({ usuarioId: ator.usuarioId }, id);
  }
}
