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
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import {
  CriarPrioridadeOperacao,
  DefinirGradeRecebimento,
  EditarPrioridadeOperacao,
  ExcluirPrioridadeOperacao,
  ListarPrioridadesOperacao,
  ObterGradeRecebimento,
} from '../../application/use-cases/prioridades-operacao';
import type { EdicaoPrioridadeOperacao } from '../../domain/prioridades-operacao';
import {
  GradeRecebimentoDto,
  PrioridadeOperacaoDto,
  PrioridadeOperacaoEdicaoDto,
} from './dto/prioridades-operacao.dto';
import {
  celulaDoDto,
  celulaParaDto,
  urgenciaDoDto,
  urgenciaParaDto,
} from './regras-operacao.mapper';

export class IdCriadoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

const quem = (ator: PrincipalUsuario) => ({ tipo: 'usuario' as const, id: ator.usuarioId });

const edicaoDoDto = (d: PrioridadeOperacaoEdicaoDto): EdicaoPrioridadeOperacao => ({
  nome: d.nome,
  posicao: d.posicao,
  urgencia: urgenciaDoDto(d.urgencia),
  padrao: d.padrao,
  grafias: d.grafias,
});

/** Configurações › Distribuição: as prioridades da operação, com o de-para de grafias. */
@ApiTags('distribuicao')
@Controller('distribuicao/prioridades-operacao')
export class PrioridadesOperacaoController {
  constructor(
    private readonly listarCaso: ListarPrioridadesOperacao,
    private readonly criarCaso: CriarPrioridadeOperacao,
    private readonly editarCaso: EditarPrioridadeOperacao,
    private readonly excluirCaso: ExcluirPrioridadeOperacao,
  ) {}

  @Get()
  @Permissao('distribuicao-config.ver')
  @ApiOkResponse({ type: [PrioridadeOperacaoDto] })
  async listar(): Promise<PrioridadeOperacaoDto[]> {
    return (await this.listarCaso.executar()).map((p) => ({
      ...p,
      grafias: [...p.grafias],
      urgencia: urgenciaParaDto(p.urgencia),
    }));
  }

  @Post()
  @Permissao('distribuicao-config.editar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse()
  criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: PrioridadeOperacaoEdicaoDto,
  ): Promise<IdCriadoDto> {
    const edicao = edicaoDoDto(corpo);
    return this.criarCaso.executar(quem(ator), edicao).then((id) => ({ id }));
  }

  @Put(':id')
  @Permissao('distribuicao-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  editar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: PrioridadeOperacaoEdicaoDto,
  ): Promise<void> {
    return this.editarCaso.executar(quem(ator), id, edicaoDoDto(corpo));
  }

  @Delete(':id')
  @Permissao('distribuicao-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.excluirCaso.executar(quem(ator), id);
  }
}

/** Configurações › Distribuição: a grade geral de recebimento (prioridade × turno). */
@ApiTags('distribuicao')
@Controller('distribuicao/recebimento')
export class GradeRecebimentoController {
  constructor(
    private readonly obterCaso: ObterGradeRecebimento,
    private readonly definirCaso: DefinirGradeRecebimento,
  ) {}

  @Get()
  @Permissao('distribuicao-config.ver')
  @ApiOkResponse({ type: GradeRecebimentoDto })
  async obter(): Promise<GradeRecebimentoDto> {
    return { celulas: (await this.obterCaso.executar()).map(celulaParaDto) };
  }

  @Put()
  @Permissao('distribuicao-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  salvar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: GradeRecebimentoDto,
  ): Promise<void> {
    return this.definirCaso.executar(quem(ator), corpo.celulas.map(celulaDoDto));
  }
}
