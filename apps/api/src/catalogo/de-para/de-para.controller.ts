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

import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { IdCriadoDto, ListarDto } from '../comum/dto';
import type {
  DadosDeParaEspecialidade,
  DadosDeParaModalidade,
  DadosDeParaPrioridade,
  DadosDeParaValor,
  DadosSufixo,
} from './de-para.repository';
import type { DeParaService } from './de-para.service';
import {
  DeParaEspecialidadeDto,
  DeParaEspecialidadeItemDto,
  DeParaModalidadeDto,
  DeParaModalidadeItemDto,
  DeParaPrioridadeDto,
  DeParaPrioridadeItemDto,
  DeParaValorDto,
  DeParaValorItemDto,
  ListarDeParaEspecialidadeDto,
  ListarDeParaModalidadeDto,
  ListarDeParaPrioridadeDto,
  PaginaDeParaEspecialidadeDto,
  PaginaDeParaModalidadeDto,
  PaginaDeParaPrioridadeDto,
  PaginaDeParaValorDto,
  PaginaSufixosDto,
  SufixoDto,
  SufixoItemDto,
} from './dto/de-para.dto';
import {
  DE_PARA_ESPECIALIDADE,
  DE_PARA_MODALIDADE,
  DE_PARA_PRIORIDADE,
  DE_PARA_VALOR,
  SUFIXOS_CLIENTE,
} from './tokens';

// Os quatro de-paras têm as mesmas rotas; mudam o caminho, o service e os DTOs.

@ApiTags('catalogo')
@Controller('catalogo/de-para/prioridades')
export class DeParaPrioridadesController {
  constructor(
    @Inject(DE_PARA_PRIORIDADE) private readonly service: DeParaService<DadosDeParaPrioridade>,
  ) {}

  @Get()
  @Permissao('de-para.ver')
  @ApiOkResponse({ type: PaginaDeParaPrioridadeDto })
  async listar(@Query() query: ListarDeParaPrioridadeDto): Promise<PaginaDeParaPrioridadeDto> {
    const { itens, total } = await this.service.listar({
      busca: query.busca,
      ativo: query.ativo,
      destinoId: query.prioridadeId,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return {
      itens,
      total,
      pagina: query.pagina,
      porPagina: query.porPagina,
    } as PaginaDeParaPrioridadeDto;
  }

  @Get(':id')
  @Permissao('de-para.ver')
  @ApiOkResponse({ type: DeParaPrioridadeItemDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<DeParaPrioridadeItemDto> {
    return this.service.obter(id) as Promise<DeParaPrioridadeItemDto>;
  }

  @Post()
  @Permissao('de-para.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos ou destino inexistente.' })
  @ApiConflictResponse({ description: 'Já existe um de-para para essa origem.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: DeParaPrioridadeDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('de-para.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Dados inválidos ou destino inexistente.' })
  @ApiConflictResponse({ description: 'Já existe um de-para para essa origem.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: DeParaPrioridadeDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('de-para.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}

@ApiTags('catalogo')
@Controller('catalogo/de-para/modalidades')
export class DeParaModalidadesController {
  constructor(
    @Inject(DE_PARA_MODALIDADE) private readonly service: DeParaService<DadosDeParaModalidade>,
  ) {}

  @Get()
  @Permissao('de-para.ver')
  @ApiOkResponse({ type: PaginaDeParaModalidadeDto })
  async listar(@Query() query: ListarDeParaModalidadeDto): Promise<PaginaDeParaModalidadeDto> {
    const { itens, total } = await this.service.listar({
      busca: query.busca,
      ativo: query.ativo,
      destinoId: query.modalidadeId,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return {
      itens,
      total,
      pagina: query.pagina,
      porPagina: query.porPagina,
    } as PaginaDeParaModalidadeDto;
  }

  @Get(':id')
  @Permissao('de-para.ver')
  @ApiOkResponse({ type: DeParaModalidadeItemDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<DeParaModalidadeItemDto> {
    return this.service.obter(id) as Promise<DeParaModalidadeItemDto>;
  }

  @Post()
  @Permissao('de-para.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos ou destino inexistente.' })
  @ApiConflictResponse({ description: 'Já existe um de-para para essa origem.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: DeParaModalidadeDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('de-para.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Dados inválidos ou destino inexistente.' })
  @ApiConflictResponse({ description: 'Já existe um de-para para essa origem.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: DeParaModalidadeDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('de-para.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}

@ApiTags('catalogo')
@Controller('catalogo/de-para/especialidades')
export class DeParaEspecialidadesController {
  constructor(
    @Inject(DE_PARA_ESPECIALIDADE)
    private readonly service: DeParaService<DadosDeParaEspecialidade>,
  ) {}

  @Get()
  @Permissao('de-para.ver')
  @ApiOkResponse({ type: PaginaDeParaEspecialidadeDto })
  async listar(
    @Query() query: ListarDeParaEspecialidadeDto,
  ): Promise<PaginaDeParaEspecialidadeDto> {
    const { itens, total } = await this.service.listar({
      busca: query.busca,
      ativo: query.ativo,
      tipo: query.tipo,
      destinoId: query.especialidadeId,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return {
      itens,
      total,
      pagina: query.pagina,
      porPagina: query.porPagina,
    } as PaginaDeParaEspecialidadeDto;
  }

  @Get(':id')
  @Permissao('de-para.ver')
  @ApiOkResponse({ type: DeParaEspecialidadeItemDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<DeParaEspecialidadeItemDto> {
    return this.service.obter(id) as Promise<DeParaEspecialidadeItemDto>;
  }

  @Post()
  @Permissao('de-para.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos ou destino inexistente.' })
  @ApiConflictResponse({ description: 'Já existe um de-para para essa origem.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: DeParaEspecialidadeDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('de-para.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Dados inválidos ou destino inexistente.' })
  @ApiConflictResponse({ description: 'Já existe um de-para para essa origem.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: DeParaEspecialidadeDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('de-para.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}

@ApiTags('catalogo')
@Controller('catalogo/de-para/valores-exame')
export class DeParaValoresExameController {
  constructor(@Inject(DE_PARA_VALOR) private readonly service: DeParaService<DadosDeParaValor>) {}

  @Get()
  @Permissao('exames.ver')
  @ApiOkResponse({ type: PaginaDeParaValorDto })
  async listar(@Query() query: ListarDto): Promise<PaginaDeParaValorDto> {
    const { itens, total } = await this.service.listar({
      busca: query.busca,
      ativo: query.ativo,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return {
      itens,
      total,
      pagina: query.pagina,
      porPagina: query.porPagina,
    } as PaginaDeParaValorDto;
  }

  @Get(':id')
  @Permissao('exames.ver')
  @ApiOkResponse({ type: DeParaValorItemDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<DeParaValorItemDto> {
    return this.service.obter(id) as Promise<DeParaValorItemDto>;
  }

  @Post()
  @Permissao('exames.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos ou destino inexistente.' })
  @ApiConflictResponse({ description: 'Já existe um de-para para essa origem.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: DeParaValorDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('exames.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Dados inválidos ou destino inexistente.' })
  @ApiConflictResponse({ description: 'Já existe um de-para para essa origem.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: DeParaValorDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('exames.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}

@ApiTags('catalogo')
@Controller('catalogo/de-para/sufixos-cliente')
export class SufixosClienteController {
  constructor(@Inject(SUFIXOS_CLIENTE) private readonly service: DeParaService<DadosSufixo>) {}

  @Get()
  @Permissao('de-para.ver')
  @ApiOkResponse({ type: PaginaSufixosDto })
  async listar(@Query() query: ListarDto): Promise<PaginaSufixosDto> {
    const { itens, total } = await this.service.listar({
      busca: query.busca,
      ativo: query.ativo,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina } as PaginaSufixosDto;
  }

  @Get(':id')
  @Permissao('de-para.ver')
  @ApiOkResponse({ type: SufixoItemDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<SufixoItemDto> {
    return this.service.obter(id) as Promise<SufixoItemDto>;
  }

  @Post()
  @Permissao('de-para.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Dados inválidos ou destino inexistente.' })
  @ApiConflictResponse({ description: 'Já existe um de-para para essa origem.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: SufixoDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('de-para.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Dados inválidos ou destino inexistente.' })
  @ApiConflictResponse({ description: 'Já existe um de-para para essa origem.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: SufixoDto,
  ): Promise<void> {
    return this.service.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('de-para.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.excluir({ usuarioId: ator.usuarioId }, id);
  }
}
