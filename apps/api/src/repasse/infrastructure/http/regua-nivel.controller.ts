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
import { ListarRegrasApuracaoGeral } from '../../application/use-cases/regras-medico';
import {
  AlterarRegua,
  EncerrarRegua,
  IncluirRegua,
  ListarRegua,
  PreencherPelaRegua,
} from '../../application/use-cases/regua-nivel';
import { MedicoParamDto } from './dto/precos-repasse.dto';
import {
  AlterarLinhaReguaDto,
  EncerrarLinhaReguaDto,
  IncluirLinhaReguaDto,
  LinhaReguaParamDto,
  ListarRegrasGeralQueryDto,
  NivelParamDto,
  PaginaRegrasApuracaoGeralDto,
  PreencherPelaReguaDto,
  PreviaPreenchimentoDto,
  ReguaNivelDto,
} from './dto/regua-nivel.dto';
import { CriadoDto } from './dto/repasse.dto';

const INVALIDO = 'Valor ou "vale a partir de" inválido (só competência aberta ou futura).';

/**
 * Régua de referência do repasse por nível (Configurações › Repasse › Régua por nível), o
 * preenchimento dos preços do médico por ela e a lista geral das regras de apuração.
 */
@ApiTags('repasse')
@Controller('repasse')
export class ReguaNivelController {
  constructor(
    private readonly listarCaso: ListarRegua,
    private readonly incluirCaso: IncluirRegua,
    private readonly alterarCaso: AlterarRegua,
    private readonly encerrarCaso: EncerrarRegua,
    private readonly preencherCaso: PreencherPelaRegua,
    private readonly regrasGeralCaso: ListarRegrasApuracaoGeral,
  ) {}

  @Get('regua/:nivelId')
  @Permissao('repasse.ver')
  @ApiOkResponse({ type: ReguaNivelDto, description: 'Todas as versões das linhas do nível.' })
  @ApiNotFoundResponse({ description: 'Nível não encontrado.' })
  regua(@Param() { nivelId }: NivelParamDto): Promise<ReguaNivelDto> {
    return this.listarCaso.executar(nivelId);
  }

  @Post('regua/:nivelId')
  @Permissao('repasse.parametros.editar')
  @ApiCreatedResponse({ type: CriadoDto })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: 'O nível já tem valor para o arranjo no período.' })
  @ApiNotFoundResponse({ description: 'Nível não encontrado.' })
  async incluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { nivelId }: NivelParamDto,
    @Body() d: IncluirLinhaReguaDto,
  ): Promise<CriadoDto> {
    return {
      id: await this.incluirCaso.executar(
        ator.usuarioId,
        {
          nivelId,
          modalidadeId: d.modalidadeId,
          especialidadeId: d.especialidadeId,
          categoriaId: d.todasCategorias ? null : d.categoriaId,
          prioridadeId: d.todasPrioridades ? null : d.prioridadeId,
          valorCentavos: d.valorCentavos,
        },
        d.aPartirDe,
      ),
    };
  }

  @Put('regua/:nivelId/:id')
  @Permissao('repasse.parametros.editar')
  @ApiOkResponse({ type: CriadoDto, description: 'A versão nova; a anterior vale até a véspera.' })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: 'Alterada por outra pessoa no meio.' })
  @ApiNotFoundResponse()
  async alterar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { nivelId, id }: LinhaReguaParamDto,
    @Body() d: AlterarLinhaReguaDto,
  ): Promise<CriadoDto> {
    return {
      id: await this.alterarCaso.executar(
        ator.usuarioId,
        nivelId,
        id,
        d.valorCentavos,
        d.aPartirDe,
      ),
    };
  }

  @Post('regua/:nivelId/:id/encerrar')
  @Permissao('repasse.parametros.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Encerrada (a programada que nunca valeu é cancelada).' })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiNotFoundResponse()
  encerrar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { nivelId, id }: LinhaReguaParamDto,
    @Body() { aPartirDe }: EncerrarLinhaReguaDto,
  ): Promise<void> {
    return this.encerrarCaso.executar(ator.usuarioId, nivelId, id, aPartirDe);
  }

  @Post('medicos/:medicoId/precos/preencher-pela-regua')
  @Permissao('repasse.precos.editar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: PreviaPreenchimentoDto,
    description: 'O que muda nos preços de todos os clientes; com `confirmar`, já gravado.',
  })
  @ApiBadRequestResponse({ description: 'Competência inválida ou médico sem nível.' })
  @ApiConflictResponse({ description: 'Alterado por outra pessoa no meio.' })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  preencher(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { medicoId }: MedicoParamDto,
    @Body() d: PreencherPelaReguaDto,
  ): Promise<PreviaPreenchimentoDto> {
    return this.preencherCaso.executar(ator.usuarioId, medicoId, d.aPartirDe, d.confirmar);
  }

  @Get('regras-apuracao')
  @Permissao('repasse.ver')
  @ApiOkResponse({
    type: PaginaRegrasApuracaoGeralDto,
    description: 'As que valem ou vão valer, de todos os médicos (só leitura).',
  })
  async regrasGeral(@Query() q: ListarRegrasGeralQueryDto): Promise<PaginaRegrasApuracaoGeralDto> {
    const r = await this.regrasGeralCaso.executar({
      busca: q.busca,
      tipo: q.tipo,
      pagina: q.pagina,
      porPagina: q.porPagina,
    });
    return { ...r, pagina: q.pagina, porPagina: q.porPagina };
  }
}
