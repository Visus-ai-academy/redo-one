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
import { IdCriadoDto, ListarDto } from '../comum/dto';
import { ContratadosService } from './contratados.service';
import { ContratadoDto, ContratadoItemDto, PaginaContratadosDto } from './dto/contratado.dto';

@ApiTags('catalogo')
@Controller('catalogo/contratados')
export class ContratadosController {
  constructor(private readonly service: ContratadosService) {}

  @Get()
  @Permissao('catalogo.ver')
  @ApiOkResponse({ type: PaginaContratadosDto })
  async listar(@Query() query: ListarDto): Promise<PaginaContratadosDto> {
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
  @ApiOkResponse({ type: ContratadoItemDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<ContratadoItemDto> {
    return this.service.obter(id);
  }

  @Post()
  @Permissao('catalogo.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Documento inválido ou consolidação de repasse inválida.' })
  @ApiConflictResponse({ description: 'Razão social ou CNPJ já usados.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: ContratadoDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('catalogo.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Documento inválido ou consolidação de repasse inválida.' })
  @ApiConflictResponse({ description: 'Razão social ou CNPJ já usados.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: ContratadoDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('catalogo.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Em uso por clientes ou contratados: desative.' })
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}
