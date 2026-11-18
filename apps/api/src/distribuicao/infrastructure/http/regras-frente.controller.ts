import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import {
  DefinirRegrasFrente,
  ListarRegrasFrente,
  ObterRegrasFrente,
  type RegrasDaFrente,
} from '../../application/use-cases/regras-frente';
import type { FrenteEscala } from '../../domain/arranjo';
import { RegrasDaFrenteDto, RegrasFrenteDto } from './dto/regras-frente.dto';
import { regrasDoDto, regrasParaDto } from './regras-frente.mapper';

const especialidade = (id: string): FrenteEscala => ({
  tipo: 'especialidade',
  especialidadeId: id,
  modalidadeId: null,
});
const modalidade = (id: string): FrenteEscala => ({
  tipo: 'modalidade',
  especialidadeId: null,
  modalidadeId: id,
});
const resposta = ({ regras, cadastrada }: RegrasDaFrente): RegrasDaFrenteDto => ({
  frente: regras.frente,
  regras: regrasParaDto(regras),
  cadastrada,
});

/**
 * Regras da frente (aba Distribuição no painel da especialidade ou da modalidade, em
 * Configurações › Classificação dos exames). Mesmas permissões de Configurações › Distribuição.
 */
@ApiTags('distribuicao')
@Controller('distribuicao/regras-frente')
export class RegrasFrenteController {
  constructor(
    private readonly obter: ObterRegrasFrente,
    private readonly definir: DefinirRegrasFrente,
    private readonly listarRegras: ListarRegrasFrente,
  ) {}

  @Get()
  @Permissao('distribuicao-config.ver')
  @ApiOkResponse({ type: [RegrasDaFrenteDto], description: 'Só as frentes com cadastro.' })
  async listar(): Promise<RegrasDaFrenteDto[]> {
    const todas = await this.listarRegras.executar();
    return todas.map((regras) => resposta({ regras, cadastrada: true }));
  }

  @Get('especialidades/:especialidadeId')
  @Permissao('distribuicao-config.ver')
  @ApiOkResponse({ type: RegrasDaFrenteDto })
  @ApiNotFoundResponse()
  async obterEspecialidade(
    @Param('especialidadeId', ParseUUIDPipe) id: string,
  ): Promise<RegrasDaFrenteDto> {
    return resposta(await this.obter.executar(especialidade(id)));
  }

  @Get('modalidades/:modalidadeId')
  @Permissao('distribuicao-config.ver')
  @ApiOkResponse({ type: RegrasDaFrenteDto })
  @ApiNotFoundResponse()
  async obterModalidade(
    @Param('modalidadeId', ParseUUIDPipe) id: string,
  ): Promise<RegrasDaFrenteDto> {
    return resposta(await this.obter.executar(modalidade(id)));
  }

  @Put('especialidades/:especialidadeId')
  @Permissao('distribuicao-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  salvarEspecialidade(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('especialidadeId', ParseUUIDPipe) id: string,
    @Body() corpo: RegrasFrenteDto,
  ): Promise<void> {
    return this.definir.executar(
      { tipo: 'usuario', id: ator.usuarioId },
      especialidade(id),
      regrasDoDto(corpo),
    );
  }

  @Put('modalidades/:modalidadeId')
  @Permissao('distribuicao-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  salvarModalidade(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('modalidadeId', ParseUUIDPipe) id: string,
    @Body() corpo: RegrasFrenteDto,
  ): Promise<void> {
    return this.definir.executar(
      { tipo: 'usuario', id: ator.usuarioId },
      modalidade(id),
      regrasDoDto(corpo),
    );
  }
}
