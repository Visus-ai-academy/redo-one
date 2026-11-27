import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import {
  AlterarAlternativaPreco,
  AlterarReclassificacao,
  CancelarVersaoConfiguracao,
} from '../../application/use-cases/configuracao-versoes';
import {
  CriadoDto,
  CriarAlternativaPrecoDto,
  CriarReclassificacaoDto,
  IdParamDto,
} from './dto/repasse.dto';

const recorte = (r: { todos: boolean; ids: string[] }) => (r.todos ? null : r.ids);
const CANCELAR =
  'Versão programada cancelada (nunca valeu); a de mesma ordem que ela encerrou volta a valer.';

/**
 * Editar e cancelar versões da configuração geral do repasse (Configurações › Repasse). Editar é
 * encerrar a versão na véspera e criar a nova; cancelar só a programada criada por engano.
 */
@ApiTags('repasse')
@Controller('repasse')
export class ConfiguracaoVersoesController {
  constructor(
    private readonly alterarReclassificacaoCaso: AlterarReclassificacao,
    private readonly alterarAlternativaCaso: AlterarAlternativaPreco,
    private readonly cancelarCaso: CancelarVersaoConfiguracao,
  ) {}

  @Put('reclassificacoes/:id')
  @Permissao('repasse.parametros.editar')
  @ApiOkResponse({ type: CriadoDto, description: 'A versão nova; a anterior vale até a véspera.' })
  @ApiBadRequestResponse()
  @ApiConflictResponse({ description: 'Alterada por outra pessoa no meio.' })
  @ApiNotFoundResponse()
  async alterarReclassificacao(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { id }: IdParamDto,
    @Body() d: CriarReclassificacaoDto,
  ): Promise<CriadoDto> {
    return {
      id: await this.alterarReclassificacaoCaso.executar(ator.usuarioId, id, d.aPartirDe, {
        ordem: d.ordem,
        descricao: d.descricao,
        modalidadeIds: recorte(d.modalidades),
        especialidadeIds: recorte(d.especialidades),
        categoriaIds: recorte(d.categorias),
        equipeIds: recorte(d.equipes),
        especialidadeDestinoId: d.especialidadeDestinoId ?? null,
        categoriaDestinoId: d.categoriaDestinoId ?? null,
      }),
    };
  }

  @Delete('reclassificacoes/:id')
  @Permissao('repasse.parametros.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: CANCELAR })
  @ApiBadRequestResponse({ description: 'A versão já valeu (encerre em vez de cancelar).' })
  @ApiNotFoundResponse()
  cancelarReclassificacao(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { id }: IdParamDto,
  ): Promise<void> {
    return this.cancelarCaso.executar(ator.usuarioId, 'reclassificacao', id);
  }

  @Put('alternativas-preco/:id')
  @Permissao('repasse.parametros.editar')
  @ApiOkResponse({ type: CriadoDto, description: 'A versão nova; a anterior vale até a véspera.' })
  @ApiBadRequestResponse()
  @ApiConflictResponse({ description: 'Alterada por outra pessoa no meio.' })
  @ApiNotFoundResponse()
  async alterarAlternativa(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { id }: IdParamDto,
    @Body() d: CriarAlternativaPrecoDto,
  ): Promise<CriadoDto> {
    return {
      id: await this.alterarAlternativaCaso.executar(ator.usuarioId, id, d.aPartirDe, {
        ordem: d.ordem,
        especialidadeId: d.todasEspecialidades ? null : (d.especialidadeId ?? null),
        semCategoria: d.semCategoria,
        categoriaOrigemId: d.semCategoria ? null : (d.categoriaOrigemId ?? null),
        categoriaDestinoId: d.categoriaDestinoId,
      }),
    };
  }

  @Delete('alternativas-preco/:id')
  @Permissao('repasse.parametros.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: CANCELAR })
  @ApiBadRequestResponse({ description: 'A versão já valeu (encerre em vez de cancelar).' })
  @ApiNotFoundResponse()
  cancelarAlternativa(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { id }: IdParamDto,
  ): Promise<void> {
    return this.cancelarCaso.executar(ator.usuarioId, 'alternativa', id);
  }

  @Delete('parametros/:id')
  @Permissao('repasse.parametros.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Versão programada cancelada; a anterior segue valendo.' })
  @ApiBadRequestResponse({ description: 'A versão já valeu (crie uma versão nova).' })
  @ApiNotFoundResponse()
  cancelarParametros(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param() { id }: IdParamDto,
  ): Promise<void> {
    return this.cancelarCaso.executar(ator.usuarioId, 'parametros', id);
  }
}
