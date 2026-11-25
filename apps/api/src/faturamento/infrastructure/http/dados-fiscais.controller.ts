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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PaginaHistoricoCadastroDto } from '../../../auditoria/historico-cadastro/dto/historico-cadastro.dto';
import { PaginacaoDto } from '../../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import { ENTIDADE_DADOS_FISCAIS } from '../../application/ports/historico-dados-fiscais';
import {
  DefinirDadosFiscais,
  HistoricoDadosFiscais,
  ObterDadosFiscais,
} from '../../application/use-cases/dados-fiscais';
import { DadosFiscaisClienteDto, DadosFiscaisDto } from './dto/dados-fiscais.dto';

/** Aba Faturamento do cliente: e-mails da NF, endereço, contato e banco. */
@ApiTags('faturamento')
@Controller('faturamento/clientes/:clienteId/dados-fiscais')
export class DadosFiscaisController {
  constructor(
    private readonly obterCaso: ObterDadosFiscais,
    private readonly definirCaso: DefinirDadosFiscais,
    private readonly historicoCaso: HistoricoDadosFiscais,
  ) {}

  @Get()
  @Permissao('clientes.faturamento.ver')
  @ApiOkResponse({ type: DadosFiscaisClienteDto })
  @ApiNotFoundResponse({ description: 'Cliente não encontrado.' })
  async obter(
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
  ): Promise<DadosFiscaisClienteDto> {
    const { dados, atualizadoEm, atualizadoPor } = await this.obterCaso.executar(clienteId);
    return {
      ...dados,
      atualizadoEm,
      atualizadoPor,
    };
  }

  @Put()
  @Permissao('clientes.faturamento.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Salvo (ou já estava igual).' })
  @ApiBadRequestResponse({
    description:
      'E-mail inválido, CEP sem 8 dígitos, UF inexistente ou endereço começado sem CEP, logradouro, cidade e UF (`campos` diz qual).',
  })
  @ApiNotFoundResponse({ description: 'Cliente não encontrado.' })
  salvar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Body() corpo: DadosFiscaisDto,
  ): Promise<void> {
    return this.definirCaso.executar(ator.usuarioId, clienteId, {
      emailsNf: corpo.emailsNf,
      email: corpo.email,
      contatoNome: corpo.contatoNome,
      telefone: corpo.telefone,
      cep: corpo.cep,
      logradouro: corpo.logradouro,
      numero: corpo.numero,
      complemento: corpo.complemento,
      bairro: corpo.bairro,
      cidade: corpo.cidade,
      uf: corpo.uf,
      bancoCodigo: corpo.bancoCodigo,
      bancoAgencia: corpo.bancoAgencia,
      bancoConta: corpo.bancoConta,
      exclusaoFiscal: corpo.exclusaoFiscal,
    });
  }

  /** Mesma página do histórico dos cadastros, para a tela usar o mesmo componente. */
  @Get('historico')
  @Permissao('clientes.faturamento.ver')
  @ApiOkResponse({
    type: PaginaHistoricoCadastroDto,
    description:
      'Alterações dos dados de faturamento, da mais nova para a mais antiga (quem, quando e cada campo antes e depois). `entidade` é sempre `cliente_dados_fiscais`; `nomes` vem vazio.',
  })
  @ApiNotFoundResponse({ description: 'Cliente não encontrado.' })
  async historico(
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Query() query: PaginacaoDto,
  ): Promise<PaginaHistoricoCadastroDto> {
    const paginacao = { pagina: query.pagina, porPagina: query.porPagina };
    const { itens, total } = await this.historicoCaso.executar(clienteId, paginacao);
    return {
      itens: itens.map((item) => ({
        id: item.id,
        ocorridoEm: item.ocorridoEm,
        ator: item.ator,
        entidade: ENTIDADE_DADOS_FISCAIS,
        entidadeId: item.clienteId,
        acao: item.acao,
        antes: item.antes,
        depois: item.depois,
      })),
      total,
      nomes: {},
      ...paginacao,
    };
  }
}
