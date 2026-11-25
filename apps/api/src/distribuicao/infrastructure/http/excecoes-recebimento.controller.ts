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
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import {
  CriarExcecaoRecebimento,
  EditarExcecaoRecebimento,
  EncerrarExcecaoRecebimento,
  ExcluirExcecaoRecebimento,
  ListarExcecoesRecebimento,
} from '../../application/use-cases/excecoes-recebimento';
import type { FrenteEscala } from '../../domain/arranjo';
import type { EdicaoExcecaoRecebimento } from '../../domain/excecoes-recebimento';
import { invalida } from '../../domain/validacao';
import { ExcecaoRecebimentoDto, ExcecaoRecebimentoEdicaoDto } from './dto/excecoes-recebimento.dto';
import { IdCriadoDto } from './prioridades-operacao.controller';
import { recebimentoDoDto, recebimentoParaDto } from './regras-operacao.mapper';

const quem = (ator: PrincipalUsuario) => ({ tipo: 'usuario' as const, id: ator.usuarioId });

function frenteDoDto(d: ExcecaoRecebimentoEdicaoDto): FrenteEscala | null {
  if (d.especialidadeId && d.modalidadeId) {
    invalida('Escolha a especialidade ou a modalidade, não as duas.');
  }
  if (d.especialidadeId) {
    return { tipo: 'especialidade', especialidadeId: d.especialidadeId, modalidadeId: null };
  }
  if (d.modalidadeId) {
    return { tipo: 'modalidade', especialidadeId: null, modalidadeId: d.modalidadeId };
  }
  return null;
}

const edicaoDoDto = (d: ExcecaoRecebimentoEdicaoDto): EdicaoExcecaoRecebimento => ({
  turnoId: d.turnoId,
  todasFrentes: d.todasFrentes,
  frente: frenteDoDto(d),
  todasPrioridades: d.todasPrioridades,
  prioridadeOperacaoId: d.prioridadeOperacaoId,
  regra: recebimentoDoDto(d.regra),
  de: d.de,
  ate: d.ate,
});

/** Configurações › Distribuição: exceções temporárias da grade de recebimento. */
@ApiTags('distribuicao')
@Controller('distribuicao/recebimento/excecoes')
export class ExcecoesRecebimentoController {
  constructor(
    private readonly listarCaso: ListarExcecoesRecebimento,
    private readonly criarCaso: CriarExcecaoRecebimento,
    private readonly editarCaso: EditarExcecaoRecebimento,
    private readonly encerrarCaso: EncerrarExcecaoRecebimento,
    private readonly excluirCaso: ExcluirExcecaoRecebimento,
  ) {}

  /** Todas (lista curta e limitada): vigentes, futuras e encerradas, da mais nova para a mais antiga. */
  @Get()
  @Permissao('distribuicao-config.ver')
  @ApiOkResponse({ type: [ExcecaoRecebimentoDto] })
  async listar(): Promise<ExcecaoRecebimentoDto[]> {
    return (await this.listarCaso.executar()).map((e) => ({
      id: e.id,
      turnoId: e.turnoId,
      todasFrentes: e.todasFrentes,
      especialidadeId: e.frente?.especialidadeId ?? null,
      modalidadeId: e.frente?.modalidadeId ?? null,
      todasPrioridades: e.todasPrioridades,
      prioridadeOperacaoId: e.prioridadeOperacaoId,
      regra: recebimentoParaDto(e.regra),
      de: e.de,
      ate: e.ate,
      criadoEm: e.criadoEm.toISOString(),
      situacao: e.situacao,
      podeExcluir: e.podeExcluir,
      empatesIds: e.empatesIds,
    }));
  }

  @Post()
  @Permissao('distribuicao-config.editar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse()
  criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: ExcecaoRecebimentoEdicaoDto,
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
    @Body() corpo: ExcecaoRecebimentoEdicaoDto,
  ): Promise<void> {
    return this.editarCaso.executar(quem(ator), id, edicaoDoDto(corpo));
  }

  /** O fim vira ontem; a exceção fica no histórico. */
  @Post(':id/encerrar')
  @Permissao('distribuicao-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  encerrar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.encerrarCaso.executar(quem(ator), id);
  }

  /** Só a que ainda não valeu em dia passado. */
  @Delete(':id')
  @Permissao('distribuicao-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.excluirCaso.executar(quem(ator), id);
  }
}
