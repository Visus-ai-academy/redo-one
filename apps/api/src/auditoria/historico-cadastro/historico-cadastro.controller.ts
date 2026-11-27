import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { PaginacaoDto } from '../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { PaginaHistoricoCadastroDto } from './dto/historico-cadastro.dto';
import type { PaginaHistoricoCadastro } from './historico-cadastro.repository';
import { HistoricoCadastroService } from './historico-cadastro.service';

const DESCRICAO = 'Mudanças registradas no cadastro, da mais nova para a mais antiga.';

/**
 * Aba Histórico dos painéis de médico, cliente, exame e fornecedor. Uma rota por cadastro, junto das rotas
 * dele, cada uma com a permissão `ver` do cadastro; a consulta à auditoria é uma só.
 */
@ApiTags('historico')
@Controller()
export class HistoricoCadastroController {
  constructor(private readonly historico: HistoricoCadastroService) {}

  @Get('medicos/:id/historico')
  @Permissao('medicos.ver')
  @ApiOkResponse({
    type: PaginaHistoricoCadastroDto,
    description: `${DESCRICAO} Pagamento, distribuição e acesso só entram com a permissão de ver cada um.`,
  })
  doMedico(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginacaoDto,
  ): Promise<PaginaHistoricoCadastroDto> {
    return this.responder(this.historico.doMedico(principal, id, paginacao(query)), query);
  }

  @Get('catalogo/clientes/:id/historico')
  @Permissao('clientes.ver')
  @ApiOkResponse({ type: PaginaHistoricoCadastroDto, description: DESCRICAO })
  doCliente(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginacaoDto,
  ): Promise<PaginaHistoricoCadastroDto> {
    return this.responder(this.historico.doCliente(id, paginacao(query)), query);
  }

  @Get('catalogo/exames/:id/historico')
  @Permissao('exames.ver')
  @ApiOkResponse({
    type: PaginaHistoricoCadastroDto,
    description: `${DESCRICAO} Inclui os valores fora do padrão ligados ao exame.`,
  })
  doExame(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginacaoDto,
  ): Promise<PaginaHistoricoCadastroDto> {
    return this.responder(this.historico.doExame(id, paginacao(query)), query);
  }

  @Get('financeiro/fornecedores/:id/historico')
  @Permissao('fornecedores.ver')
  @ApiOkResponse({ type: PaginaHistoricoCadastroDto, description: DESCRICAO })
  doFornecedor(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginacaoDto,
  ): Promise<PaginaHistoricoCadastroDto> {
    return this.responder(this.historico.doFornecedor(id, paginacao(query)), query);
  }

  private async responder(
    consulta: Promise<PaginaHistoricoCadastro>,
    query: PaginacaoDto,
  ): Promise<PaginaHistoricoCadastroDto> {
    return { ...(await consulta), pagina: query.pagina, porPagina: query.porPagina };
  }
}

const paginacao = (query: PaginacaoDto) => ({ pagina: query.pagina, porPagina: query.porPagina });
