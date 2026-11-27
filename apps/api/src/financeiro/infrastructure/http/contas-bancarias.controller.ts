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
  ConsultarContasBancarias,
  ExcluirContaBancaria,
  ListarEmpresas,
  SalvarContaBancaria,
} from '../../application/use-cases/contas-bancarias';
import {
  ContaBancariaDetalheDto,
  ContaBancariaDto,
  EmpresaFinanceiroDto,
  ListarContasBancariasDto,
  PaginaContasBancariasDto,
} from './dto/conta-bancaria.dto';

const INVALIDA =
  'Empresa que não usa o financeiro, apelido vazio, data ou credencial inválida; `campos` diz qual.';

/** Configurações › Financeiro › Contas bancárias. */
@ApiTags('financeiro')
@Controller('financeiro/contas-bancarias')
export class ContasBancariasController {
  constructor(
    private readonly consultar: ConsultarContasBancarias,
    private readonly salvar: SalvarContaBancaria,
    private readonly excluirCaso: ExcluirContaBancaria,
  ) {}

  @Get()
  @Permissao('contas-bancarias.ver')
  @ApiOkResponse({ type: PaginaContasBancariasDto })
  async listar(@Query() query: ListarContasBancariasDto): Promise<PaginaContasBancariasDto> {
    const { itens, total } = await this.consultar.listar({
      empresa: query.empresa === 'todas' ? 'todas' : { id: query.empresa },
      situacao: query.situacao,
      busca: query.busca,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get(':id')
  @Permissao('contas-bancarias.ver')
  @ApiOkResponse({ type: ContaBancariaDetalheDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<ContaBancariaDetalheDto> {
    return this.consultar.obter(id);
  }

  @Post()
  @Permissao('contas-bancarias.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: INVALIDA })
  @ApiConflictResponse({ description: 'A empresa já tem uma conta com o apelido.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: ContaBancariaDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.salvar.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('contas-bancarias.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: INVALIDA })
  @ApiConflictResponse({ description: 'A empresa já tem uma conta com o apelido.' })
  @ApiNotFoundResponse()
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: ContaBancariaDto,
  ): Promise<void> {
    return this.salvar.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('contas-bancarias.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Com baixas ou títulos ligados: desative.' })
  @ApiNotFoundResponse()
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.excluirCaso.executar({ usuarioId: ator.usuarioId }, id);
  }
}

/** As empresas do financeiro (contratados que usam o financeiro do One), para filtros e campos. */
@ApiTags('financeiro')
@Controller('financeiro/empresas')
export class EmpresasFinanceiroController {
  constructor(private readonly listarCaso: ListarEmpresas) {}

  @Get()
  @Permissao('contas-bancarias.ver')
  @ApiOkResponse({ type: [EmpresaFinanceiroDto] })
  listar(): Promise<EmpresaFinanceiroDto[]> {
    return this.listarCaso.executar();
  }
}
