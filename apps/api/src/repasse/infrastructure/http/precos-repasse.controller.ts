import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { VersaoPrecoComNomes } from '../../application/ports/precos-repasse.repository';
import {
  ExportarPrecosMedico,
  HistoricoPrecoMedico,
  ListarPrecosMedico,
  MudarPrecosMedico,
  OpcoesPrecosRepasse,
} from '../../application/use-cases/precos-medico';
import type { DadosPrecoRepasse } from '../../domain/versoes-preco';
import {
  EncerrarPrecoRepasseDto,
  HistoricoPrecoRepasseQueryDto,
  ImportarPrecosRepasseDto,
  ListarPrecosRepasseQueryDto,
  MedicoParamDto,
  MudarPrecoRepasseDto,
  OpcoesPrecoRepasseDto,
  PlanilhaPrecosRepasseDto,
  PrecoRepasseParamDto,
  ResultadoImportacaoPrecosRepasseDto,
  TabelaPrecosRepasseDto,
  VersaoHistoricoPrecoRepasseDto,
} from './dto/precos-repasse.dto';
import { CriadoDto } from './dto/repasse.dto';

const dadosDo = (d: MudarPrecoRepasseDto): DadosPrecoRepasse => ({
  modalidadeId: d.modalidadeId,
  especialidadeId: d.especialidadeId,
  categoriaId: d.categoriaId,
  prioridadeId: d.prioridadeId,
  clienteId: d.todosClientes ? null : d.clienteId,
  valorCentavos: Math.round(d.valor * 100),
});

/** Centavos (banco) → reais (contrato, como o preço do cliente). */
const emReais = <V extends VersaoPrecoComNomes>({ valorCentavos, ...v }: V) => ({
  ...v,
  todosClientes: v.clienteId === null,
  valor: valorCentavos / 100,
});

const INVALIDO =
  'Valor ou "vale a partir de" inválido: só competência aberta ou futura, depois de toda fechada ou travada.';
const CONFLITO = 'Arranjo e cliente já com preço no período, ou alterado por outra pessoa no meio.';

/**
 * Preços de repasse do médico (aba Repasse › Preços): arranjo × cliente, com "todos os clientes"
 * explícito. Nada se sobrescreve: alterar e encerrar criam versões a partir da competência escolhida.
 */
@ApiTags('repasse')
@Controller('repasse')
export class PrecosRepasseController {
  constructor(
    private readonly listarCaso: ListarPrecosMedico,
    private readonly historicoCaso: HistoricoPrecoMedico,
    private readonly mudarCaso: MudarPrecosMedico,
    private readonly exportarCaso: ExportarPrecosMedico,
    private readonly opcoesCaso: OpcoesPrecosRepasse,
  ) {}

  @Get('opcoes')
  @Permissao('repasse.ver')
  @ApiOkResponse({
    type: OpcoesPrecoRepasseDto,
    description: 'Cadastros ativos para os editores do repasse.',
  })
  opcoes(): Promise<OpcoesPrecoRepasseDto> {
    return this.opcoesCaso.executar();
  }

  @Get('medicos/:medicoId/precos')
  @Permissao('repasse.ver')
  @ApiOkResponse({ type: TabelaPrecosRepasseDto, description: 'Em vigor e programados.' })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  async listar(
    @Param() { medicoId }: MedicoParamDto,
    @Query() q: ListarPrecosRepasseQueryDto,
  ): Promise<TabelaPrecosRepasseDto> {
    const arranjo =
      q.modalidadeId && q.especialidadeId && q.categoriaId && q.prioridadeId
        ? {
            modalidadeId: q.modalidadeId,
            especialidadeId: q.especialidadeId,
            categoriaId: q.categoriaId,
            prioridadeId: q.prioridadeId,
          }
        : undefined;
    const t = await this.listarCaso.executar(medicoId, {
      pagina: q.pagina,
      porPagina: q.porPagina,
      busca: q.busca,
      arranjo,
    });
    return {
      ...t,
      itens: t.itens.map(emReais),
      pagina: q.pagina,
      porPagina: q.porPagina,
    };
  }

  @Get('medicos/:medicoId/precos/historico')
  @Permissao('repasse.ver')
  @ApiOkResponse({ type: [VersaoHistoricoPrecoRepasseDto], description: 'Do arranjo e cliente.' })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  async historico(
    @Param() { medicoId }: MedicoParamDto,
    @Query() q: HistoricoPrecoRepasseQueryDto,
  ): Promise<VersaoHistoricoPrecoRepasseDto[]> {
    const { todosClientes, clienteId, ...arranjo } = q;
    return (
      await this.historicoCaso.executar(
        medicoId,
        arranjo,
        todosClientes ? null : (clienteId ?? null),
      )
    ).map(emReais);
  }

  @Get('medicos/:medicoId/precos/exportar')
  @Permissao('repasse.ver')
  @ApiOkResponse({ type: PlanilhaPrecosRepasseDto })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  exportar(@Param() { medicoId }: MedicoParamDto): Promise<PlanilhaPrecosRepasseDto> {
    return this.exportarCaso.executar(medicoId);
  }

  @Post('medicos/:medicoId/precos')
  @Permissao('repasse.precos.editar')
  @ApiCreatedResponse({ type: CriadoDto })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: CONFLITO })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  async incluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { medicoId }: MedicoParamDto,
    @Body() corpo: MudarPrecoRepasseDto,
  ): Promise<CriadoDto> {
    return {
      id: await this.mudarCaso.incluir(ator.usuarioId, medicoId, dadosDo(corpo), corpo.aPartirDe),
    };
  }

  @Put('medicos/:medicoId/precos/:precoId')
  @Permissao('repasse.precos.editar')
  @ApiOkResponse({ type: CriadoDto, description: 'A versão nova; a anterior foi encerrada.' })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: CONFLITO })
  @ApiNotFoundResponse({ description: 'Preço ou médico não encontrado.' })
  async alterar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { medicoId, precoId }: PrecoRepasseParamDto,
    @Body() corpo: MudarPrecoRepasseDto,
  ): Promise<CriadoDto> {
    return {
      id: await this.mudarCaso.alterar(
        ator.usuarioId,
        medicoId,
        precoId,
        dadosDo(corpo),
        corpo.aPartirDe,
      ),
    };
  }

  @Post('medicos/:medicoId/precos/:precoId/encerrar')
  @Permissao('repasse.precos.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Encerrado (o programado que nunca valeu é apagado).' })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: CONFLITO })
  @ApiNotFoundResponse({ description: 'Preço ou médico não encontrado.' })
  encerrar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { medicoId, precoId }: PrecoRepasseParamDto,
    @Body() corpo: EncerrarPrecoRepasseDto,
  ): Promise<void> {
    return this.mudarCaso.encerrar(ator.usuarioId, medicoId, precoId, corpo.aPartirDe);
  }

  @Post('medicos/:medicoId/precos/importar')
  @Permissao('repasse.precos.editar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResultadoImportacaoPrecosRepasseDto })
  @ApiBadRequestResponse({
    description: 'Planilha com problema (`erros` traz a linha e o motivo); nada foi importado.',
  })
  @ApiConflictResponse({ description: CONFLITO })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  importar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { medicoId }: MedicoParamDto,
    @Body() corpo: ImportarPrecosRepasseDto,
  ): Promise<ResultadoImportacaoPrecosRepasseDto> {
    return this.mudarCaso.importar(ator.usuarioId, medicoId, corpo.conteudo, corpo.aPartirDe);
  }
}
