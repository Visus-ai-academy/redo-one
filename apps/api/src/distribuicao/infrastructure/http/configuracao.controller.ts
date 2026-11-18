import { Body, Controller, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import {
  DefinirConfiguracaoGlobal,
  ObterConfiguracaoGlobal,
} from '../../application/use-cases/configuracao-global';
import {
  ConfiguracaoDistribuicaoDto,
  ConfiguracaoDistribuicaoRespostaDto,
} from './dto/configuracao.dto';

/** Configurações › Distribuição: a configuração global do robô (linha única). */
@ApiTags('distribuicao')
@Controller('distribuicao/configuracao')
export class ConfiguracaoDistribuicaoController {
  constructor(
    private readonly obterConfiguracao: ObterConfiguracaoGlobal,
    private readonly definir: DefinirConfiguracaoGlobal,
  ) {}

  @Get()
  @Permissao('distribuicao-config.ver')
  @ApiOkResponse({ type: ConfiguracaoDistribuicaoRespostaDto })
  obter(): Promise<ConfiguracaoDistribuicaoRespostaDto> {
    return this.obterConfiguracao.executar();
  }

  @Put()
  @Permissao('distribuicao-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  salvar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: ConfiguracaoDistribuicaoDto,
  ): Promise<void> {
    return this.definir.executar({ tipo: 'usuario', id: ator.usuarioId }, corpo);
  }
}
