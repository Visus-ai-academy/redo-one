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
import { DefinirDadosFiscais, ObterDadosFiscais } from '../../application/use-cases/dados-fiscais';
import { DadosFiscaisClienteDto, DadosFiscaisDto } from './dto/dados-fiscais.dto';

/** Aba Faturamento do cliente: e-mails da NF, endereço, contato, banco e Omie. */
@ApiTags('faturamento')
@Controller('faturamento/clientes/:clienteId/dados-fiscais')
export class DadosFiscaisController {
  constructor(
    private readonly obterCaso: ObterDadosFiscais,
    private readonly definirCaso: DefinirDadosFiscais,
  ) {}

  @Get()
  @Permissao('clientes.faturamento.ver')
  @ApiOkResponse({ type: DadosFiscaisClienteDto })
  @ApiNotFoundResponse({ description: 'Cliente não encontrado.' })
  async obter(
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
  ): Promise<DadosFiscaisClienteDto> {
    const { dados, omie, atualizadoEm, atualizadoPor } = await this.obterCaso.executar(clienteId);
    return {
      ...dados,
      omieCodigoCliente: omie.codigoCliente,
      omieSincronizadoEm: omie.sincronizadoEm,
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
}
