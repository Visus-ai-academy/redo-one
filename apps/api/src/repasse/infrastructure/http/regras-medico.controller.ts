import {
  Body,
  Controller,
  Delete,
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

import { PaginacaoDto } from '../../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { DadosRegraApuracao } from '../../application/ports/regras-medico.repository';
import { ListarAdicionaisDoMedico } from '../../application/use-cases/adicionais';
import {
  AlterarRegraApuracao,
  CancelarRegraApuracao,
  CancelarVersaoContagem,
  CriarRegraApuracao,
  EncerrarRegraApuracao,
  ListarContagemMedico,
  ListarRegrasApuracao,
  NovaVersaoContagem,
} from '../../application/use-cases/regras-medico';
import { MedicoParamDto } from './dto/precos-repasse.dto';
import {
  ContagemMedicoDto,
  DadosRegraApuracaoDto,
  EncerrarVersaoDto,
  MedicoVersaoParamDto,
  NovaVersaoContagemDto,
  PaginaAdicionaisMedicoDto,
  RegrasApuracaoMedicoDto,
} from './dto/regras-medico.dto';
import { CriadoDto } from './dto/repasse.dto';

const dadosDaRegra = (d: DadosRegraApuracaoDto): DadosRegraApuracao => ({
  tipo: d.tipo,
  descricao: d.descricao,
  valorCentavos: d.valorCentavos ?? null,
  percentualPpm: d.percentualPpm ?? null,
  divisor: d.divisor,
  modalidadeIds: d.modalidades.todas ? null : d.modalidades.ids,
  especialidadeIds: d.especialidades.todas ? null : d.especialidades.ids,
  prioridadeIds: d.prioridades.todas ? null : d.prioridades.ids,
});

const INVALIDO = 'Dados ou "vale a partir de" inválidos (só competência aberta ou futura).';
const CONFLITO = 'Alterado por outra pessoa no meio: recarregue.';

/**
 * Regras do repasse de um médico (aba Repasse › Regras e Apuração) e os adicionais dele. Tudo com
 * vigência por competência: mudar é criar versão nova; a programada criada por engano se cancela.
 */
@ApiTags('repasse')
@Controller('repasse/medicos/:medicoId')
export class RegrasMedicoController {
  constructor(
    private readonly listarContagemCaso: ListarContagemMedico,
    private readonly novaContagemCaso: NovaVersaoContagem,
    private readonly cancelarContagemCaso: CancelarVersaoContagem,
    private readonly listarRegrasCaso: ListarRegrasApuracao,
    private readonly criarRegraCaso: CriarRegraApuracao,
    private readonly alterarRegraCaso: AlterarRegraApuracao,
    private readonly encerrarRegraCaso: EncerrarRegraApuracao,
    private readonly cancelarRegraCaso: CancelarRegraApuracao,
    private readonly adicionaisCaso: ListarAdicionaisDoMedico,
  ) {}

  @Get('contagem')
  @Permissao('repasse.ver')
  @ApiOkResponse({ type: ContagemMedicoDto, description: 'Como os laudos contam, com histórico.' })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  contagem(@Param() { medicoId }: MedicoParamDto): Promise<ContagemMedicoDto> {
    return this.listarContagemCaso.executar(medicoId);
  }

  @Post('contagem')
  @Permissao('repasse.regras.editar')
  @ApiCreatedResponse({
    type: CriadoDto,
    description: 'Versão nova; a anterior vale até a véspera.',
  })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: CONFLITO })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  async novaContagem(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { medicoId }: MedicoParamDto,
    @Body() d: NovaVersaoContagemDto,
  ): Promise<CriadoDto> {
    return {
      id: await this.novaContagemCaso.executar(
        ator.usuarioId,
        medicoId,
        {
          modo: d.modo,
          recortes: d.recortes.map((r) => ({
            clienteId: r.todosClientes ? null : r.clienteId,
            especialidadeId: r.todasEspecialidades ? null : r.especialidadeId,
          })),
        },
        d.aPartirDe,
      ),
    };
  }

  @Delete('contagem/:id')
  @Permissao('repasse.regras.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Versão programada cancelada; a anterior volta a valer.' })
  @ApiBadRequestResponse({ description: 'A versão já valeu (encerre em vez de cancelar).' })
  @ApiNotFoundResponse()
  cancelarContagem(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { medicoId, id }: MedicoVersaoParamDto,
  ): Promise<void> {
    return this.cancelarContagemCaso.executar(ator.usuarioId, medicoId, id);
  }

  @Get('regras-apuracao')
  @Permissao('repasse.ver')
  @ApiOkResponse({ type: RegrasApuracaoMedicoDto })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  regras(@Param() { medicoId }: MedicoParamDto): Promise<RegrasApuracaoMedicoDto> {
    return this.listarRegrasCaso.executar(medicoId);
  }

  @Post('regras-apuracao')
  @Permissao('repasse.regras.editar')
  @ApiCreatedResponse({ type: CriadoDto })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: CONFLITO })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  async criarRegra(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { medicoId }: MedicoParamDto,
    @Body() d: DadosRegraApuracaoDto,
  ): Promise<CriadoDto> {
    return {
      id: await this.criarRegraCaso.executar(
        ator.usuarioId,
        medicoId,
        dadosDaRegra(d),
        d.aPartirDe,
      ),
    };
  }

  @Put('regras-apuracao/:id')
  @Permissao('repasse.regras.editar')
  @ApiOkResponse({ type: CriadoDto, description: 'A versão nova; a anterior vale até a véspera.' })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: CONFLITO })
  @ApiNotFoundResponse()
  async alterarRegra(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { medicoId, id }: MedicoVersaoParamDto,
    @Body() d: DadosRegraApuracaoDto,
  ): Promise<CriadoDto> {
    return {
      id: await this.alterarRegraCaso.executar(
        ator.usuarioId,
        medicoId,
        id,
        dadosDaRegra(d),
        d.aPartirDe,
      ),
    };
  }

  @Post('regras-apuracao/:id/encerrar')
  @Permissao('repasse.regras.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deixa de valer a partir de `aPartirDe`.' })
  @ApiBadRequestResponse({ description: INVALIDO })
  @ApiConflictResponse({ description: CONFLITO })
  @ApiNotFoundResponse()
  encerrarRegra(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { medicoId, id }: MedicoVersaoParamDto,
    @Body() { aPartirDe }: EncerrarVersaoDto,
  ): Promise<void> {
    return this.encerrarRegraCaso.executar(ator.usuarioId, medicoId, id, aPartirDe);
  }

  @Delete('regras-apuracao/:id')
  @Permissao('repasse.regras.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Versão programada cancelada; a anterior volta a valer.' })
  @ApiBadRequestResponse({ description: 'A versão já valeu (encerre em vez de cancelar).' })
  @ApiNotFoundResponse()
  cancelarRegra(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { medicoId, id }: MedicoVersaoParamDto,
  ): Promise<void> {
    return this.cancelarRegraCaso.executar(ator.usuarioId, medicoId, id);
  }

  @Get('adicionais')
  @Permissao('repasse.ver')
  @ApiOkResponse({
    type: PaginaAdicionaisMedicoDto,
    description: 'Competência mais nova primeiro.',
  })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  async adicionais(
    @Param() { medicoId }: MedicoParamDto,
    @Query() p: PaginacaoDto,
  ): Promise<PaginaAdicionaisMedicoDto> {
    const r = await this.adicionaisCaso.executar(medicoId, p);
    return { ...r, pagina: p.pagina, porPagina: p.porPagina };
  }
}
