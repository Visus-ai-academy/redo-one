import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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

import { IdCriadoDto } from '../../catalogo/comum/dto';
import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { AliasesMedicoService } from '../aliases/aliases-medico.service';
import { OutrasContasMedicoService } from '../outras-contas/outras-contas-medico.service';
import { PagamentoMedicoDto } from '../pagamento/dto/pagamento.dto';
import { PagamentoMedicoService } from '../pagamento/pagamento-medico.service';
import {
  AliasMedicoDto,
  ListarMedicosDto,
  MedicoDetalheDto,
  MedicoDto,
  OutraContaMedicoDto,
  PaginaMedicosDto,
} from './dto/medico.dto';
import { MedicosService } from './medicos.service';

@ApiTags('medicos')
@Controller('medicos')
export class MedicosController {
  constructor(
    private readonly medicos: MedicosService,
    private readonly aliases: AliasesMedicoService,
    private readonly pagamento: PagamentoMedicoService,
    private readonly outrasContas: OutrasContasMedicoService,
  ) {}

  @Get()
  @Permissao('medicos.ver')
  @ApiOkResponse({ type: PaginaMedicosDto })
  async listar(@Query() query: ListarMedicosDto): Promise<PaginaMedicosDto> {
    const { itens, total } = await this.medicos.listar({
      busca: query.busca,
      ativo: query.ativo,
      nivelId: query.nivelId,
      equipeId: query.equipeId,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  @Get(':id')
  @Permissao('medicos.ver')
  @ApiOkResponse({ type: MedicoDetalheDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<MedicoDetalheDto> {
    return this.medicos.obter(id);
  }

  @Post()
  @Permissao('medicos.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Nome sem letras ou nível inexistente.' })
  @ApiConflictResponse({ description: 'Nome ou id da MobileMed já usado.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: MedicoDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.medicos.criar({ usuarioId: ator.usuarioId }, corpo) };
  }

  @Put(':id')
  @Permissao('medicos.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Nome sem letras ou nível inexistente.' })
  @ApiConflictResponse({ description: 'Nome ou id da MobileMed já usado.' })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: MedicoDto,
  ): Promise<void> {
    return this.medicos.atualizar({ usuarioId: ator.usuarioId }, id, corpo);
  }

  @Delete(':id')
  @Permissao('medicos.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Em uso por outro cadastro: desative em vez de excluir.' })
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.medicos.excluir({ usuarioId: ator.usuarioId }, id);
  }

  @Post(':id/aliases')
  @Permissao('medicos.criar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Grafia sem letras ou igual à do próprio médico.' })
  @ApiConflictResponse({ description: 'Grafia ligada a outro médico ou nome de outro médico.' })
  async criarAlias(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: AliasMedicoDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.aliases.criar({ usuarioId: ator.usuarioId }, id, corpo) };
  }

  @Delete(':id/aliases/:aliasId')
  @Permissao('medicos.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  excluirAlias(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aliasId', ParseUUIDPipe) aliasId: string,
  ): Promise<void> {
    return this.aliases.excluir({ usuarioId: ator.usuarioId }, id, aliasId);
  }

  @Post(':id/outras-contas')
  @Permissao('medicos.editar')
  @ApiCreatedResponse({ type: IdCriadoDto })
  @ApiBadRequestResponse({ description: 'Id que não é inteiro positivo.' })
  @ApiConflictResponse({ description: 'Conta já é deste médico ou de outro (principal ou outra).' })
  @ApiNotFoundResponse()
  async adicionarOutraConta(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: OutraContaMedicoDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.outrasContas.adicionar({ usuarioId: ator.usuarioId }, id, corpo) };
  }

  @Delete(':id/outras-contas/:contaId')
  @Permissao('medicos.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  removerOutraConta(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contaId', ParseUUIDPipe) contaId: string,
  ): Promise<void> {
    return this.outrasContas.remover({ usuarioId: ator.usuarioId }, id, contaId);
  }

  @Get(':id/pagamento')
  @Permissao('medicos.pagamento.ver')
  @ApiOkResponse({ type: PagamentoMedicoDto, description: 'Cada leitura vai para a auditoria.' })
  @ApiNotFoundResponse()
  obterPagamento(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PagamentoMedicoDto> {
    return this.pagamento.obter({ usuarioId: ator.usuarioId }, id);
  }

  @Put(':id/pagamento')
  @Permissao('medicos.pagamento.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: 'Documento inválido ou chave Pix sem o tipo.' })
  @ApiNotFoundResponse()
  salvarPagamento(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: PagamentoMedicoDto,
  ): Promise<void> {
    return this.pagamento.salvar({ usuarioId: ator.usuarioId }, id, corpo);
  }
}
