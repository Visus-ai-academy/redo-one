import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import {
  ConsultarConfiguracoes,
  ConsultarInadimplencia,
  SalvarConfiguracao,
} from '../../application/use-cases/configuracoes';
import {
  ConfiguracaoDto,
  ConfiguracaoEmpresaDto,
  ListarInadimplenciaDto,
  PaginaInadimplenciaDto,
} from './dto/configuracao.dto';

/** Configurações › Financeiro › Regras financeiras: o que vale para cada empresa. */
@ApiTags('financeiro')
@Controller('financeiro/configuracoes')
export class ConfiguracoesFinanceirasController {
  constructor(
    private readonly consultar: ConsultarConfiguracoes,
    private readonly salvar: SalvarConfiguracao,
  ) {}

  @Get()
  @Permissao('financeiro-config.ver')
  @ApiOkResponse({ type: [ConfiguracaoEmpresaDto] })
  listar(): Promise<ConfiguracaoEmpresaDto[]> {
    return this.consultar.listar();
  }

  @Put(':empresaId')
  @Permissao('financeiro-config.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Faixas inválidas ou empresa fora do financeiro.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('empresaId', ParseUUIDPipe) empresaId: string,
    @Body() corpo: ConfiguracaoDto,
  ): Promise<void> {
    return this.salvar.executar({ usuarioId: ator.usuarioId }, empresaId, corpo);
  }
}

/** Contas a receber › Inadimplência: os clientes com títulos vencidos. */
@ApiTags('financeiro')
@Controller('financeiro/contas-receber/inadimplencia')
export class InadimplenciaController {
  constructor(private readonly consultar: ConsultarInadimplencia) {}

  @Get()
  @Permissao('contas-receber.ver')
  @ApiOkResponse({ type: PaginaInadimplenciaDto })
  async listar(@Query() query: ListarInadimplenciaDto): Promise<PaginaInadimplenciaDto> {
    const pagina = await this.consultar.listar({
      empresa: query.empresa === 'todas' ? 'todas' : { id: query.empresa },
      faixa: query.faixa,
      busca: query.busca,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { ...pagina, pagina: query.pagina, porPagina: query.porPagina };
  }
}
