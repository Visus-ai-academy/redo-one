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

import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { IdCriadoDto } from '../comum/dto';
import { AliasesClienteService } from './aliases-cliente.service';
import { ClientesService } from './clientes.service';
import {
  AliasDto,
  ClienteDetalheDto,
  ClienteDto,
  ListarClientesDto,
  PaginaClientesDto,
  UnidadeDto,
} from './dto/cliente.dto';
import { UnidadesClienteService } from './unidades-cliente.service';

@ApiTags('catalogo')
@Controller('catalogo/clientes')
export class ClientesController {
  constructor(
    private readonly clientes: ClientesService,
    private readonly aliases: AliasesClienteService,
    private readonly unidades: UnidadesClienteService,
  ) {}

  @Get()
  @Permissao('clientes.ver')
  @ApiOkResponse({ type: PaginaClientesDto })
  async listar(@Query() query: ListarClientesDto): Promise<PaginaClientesDto> {
    const { itens, total } = await this.clientes.listar({
      busca: query.busca,
      ativo: query.ativo,
      contratadoId: query.contratadoId,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get(':id')
  @Permissao('clientes.ver')
  @ApiOkResponse({ type: ClienteDetalheDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<ClienteDetalheDto> {
    return this.clientes.obter(id);
  }

  @Post()
  @Permissao('clientes.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Sem empresa que fatura ou documento inválido.' })
  @ApiConflictResponse({ description: 'Nome já usado.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: ClienteDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.clientes.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('clientes.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Sem empresa que fatura ou documento inválido.' })
  @ApiConflictResponse({ description: 'Nome já usado.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: ClienteDto,
  ): Promise<void> {
    return this.clientes.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('clientes.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Em uso por outro cadastro: desative em vez de excluir.' })
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.clientes.excluir({ usuarioId: ator.usuarioId }, id);
  }

  @Post(':id/aliases')
  @Permissao('clientes.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Grafia vazia ou igual à do próprio cliente.' })
  @ApiConflictResponse({ description: 'Apelido ligado a outro cliente ou nome de outro cliente.' })
  async criarAlias(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: AliasDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.aliases.criar({ usuarioId: ator.usuarioId }, id, corpo) };
  }

  @Delete(':id/aliases/:aliasId')
  @Permissao('clientes.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  excluirAlias(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aliasId', ParseUUIDPipe) aliasId: string,
  ): Promise<void> {
    return this.aliases.excluir({ usuarioId: ator.usuarioId }, id, aliasId);
  }

  @Post(':id/unidades')
  @Permissao('clientes.criar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'O cliente do corpo passa a ser unidade deste.' })
  @ApiBadRequestResponse({ description: 'Unificação de mais de um nível ou no próprio cliente.' })
  @ApiConflictResponse({ description: 'O cliente já é unidade (deste ou de outro principal).' })
  @ApiNotFoundResponse()
  adicionarUnidade(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: UnidadeDto,
  ): Promise<void> {
    return this.unidades.adicionar({ usuarioId: ator.usuarioId }, id, corpo.clienteId);
  }

  @Delete(':id/unidades/:unidadeId')
  @Permissao('clientes.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'A unidade volta a ser cliente independente.' })
  @ApiNotFoundResponse()
  removerUnidade(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('unidadeId', ParseUUIDPipe) unidadeId: string,
  ): Promise<void> {
    return this.unidades.remover({ usuarioId: ator.usuarioId }, id, unidadeId);
  }
}
