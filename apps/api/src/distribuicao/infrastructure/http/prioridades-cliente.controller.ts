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
  DefinirPrioridadesCliente,
  ObterPrioridadesCliente,
} from '../../application/use-cases/prioridades-cliente';
import type { FrenteEscala } from '../../domain/arranjo';
import { invalida } from '../../domain/validacao';
import { type PrioridadeClienteDto, PrioridadesClienteDto } from './dto/prioridades-cliente.dto';

function frenteDo(dto: PrioridadeClienteDto): FrenteEscala {
  if ((dto.especialidadeId === null) === (dto.modalidadeId === null)) {
    return invalida('Cada prioridade é de uma especialidade ou de uma modalidade.');
  }
  return dto.especialidadeId !== null
    ? { tipo: 'especialidade', especialidadeId: dto.especialidadeId, modalidadeId: null }
    : { tipo: 'modalidade', especialidadeId: null, modalidadeId: dto.modalidadeId as string };
}

/** Aba Distribuição do cliente: a prioridade dele em cada especialidade ou modalidade. */
@ApiTags('distribuicao')
@Controller('distribuicao/clientes/:clienteId/prioridades')
export class PrioridadesClienteController {
  constructor(
    private readonly obterPrioridades: ObterPrioridadesCliente,
    private readonly definir: DefinirPrioridadesCliente,
  ) {}

  @Get()
  @Permissao('clientes.distribuicao.ver')
  @ApiOkResponse({ type: PrioridadesClienteDto })
  @ApiNotFoundResponse()
  async obter(
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
  ): Promise<PrioridadesClienteDto> {
    const itens = await this.obterPrioridades.executar(clienteId);
    return {
      prioridades: itens.map((i) => ({
        especialidadeId: i.frente.especialidadeId,
        modalidadeId: i.frente.modalidadeId,
        nivel: i.nivel,
      })),
    };
  }

  @Put()
  @Permissao('clientes.distribuicao.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  salvar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('clienteId', ParseUUIDPipe) clienteId: string,
    @Body() corpo: PrioridadesClienteDto,
  ): Promise<void> {
    const itens = corpo.prioridades.map((p) => ({ frente: frenteDo(p), nivel: p.nivel }));
    return this.definir.executar({ tipo: 'usuario', id: ator.usuarioId }, clienteId, itens);
  }
}
