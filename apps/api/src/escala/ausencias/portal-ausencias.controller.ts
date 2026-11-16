import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { IdCriadoDto, PaginacaoDto } from '../../catalogo/comum/dto';
import { PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { PaginaAusenciasPortalDto, PedidoAusenciaDto } from './dto/ausencia.dto';
import { PortalAusenciasService } from './portal-ausencias.service';

/**
 * Ausências no portal do médico. Sem `@Permissao`: basta a sessão de uma pessoa (o guard global
 * recusa quem não está logado e as chaves de robô); o recorte é o médico ligado à conta
 * (`usuarios.medico_id`), e a conta sem médico recebe 403.
 */
@ApiTags('escala')
@Controller('escala/portal/ausencias')
export class PortalAusenciasController {
  constructor(@Inject(PortalAusenciasService) private readonly service: PortalAusenciasService) {}

  @Get()
  @ApiOkResponse({
    type: PaginaAusenciasPortalDto,
    description: 'As do médico, mais recentes primeiro.',
  })
  @ApiForbiddenResponse({ description: 'Conta sem médico ligado.' })
  async listar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Query() { pagina, porPagina }: PaginacaoDto,
  ): Promise<PaginaAusenciasPortalDto> {
    const { itens, total } = await this.service.listar(
      { usuarioId: principal.usuarioId },
      { pagina, porPagina },
    );
    return {
      itens: itens.map(({ solicitadaPor: _s, revisadaPor: _r, ...ausencia }) => ausencia),
      total,
      pagina,
      porPagina,
    };
  }

  @Post()
  @ApiCreatedResponse({ type: IdCriadoDto, description: 'O pedido nasce pendente.' })
  @ApiBadRequestResponse({ description: 'Período, dias, motivo, tipo inativo ou inexistente.' })
  @ApiForbiddenResponse({ description: 'Conta sem médico ou tipo que só o gestor lança.' })
  async solicitar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Body() corpo: PedidoAusenciaDto,
  ): Promise<IdCriadoDto> {
    return { id: await this.service.solicitar({ usuarioId: principal.usuarioId }, corpo) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Pedido cancelado (apagado).' })
  @ApiNotFoundResponse()
  @ApiBadRequestResponse({ description: 'O pedido já foi revisado.' })
  @ApiForbiddenResponse({ description: 'Conta sem médico ou ausência lançada pelo gestor.' })
  cancelar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.service.cancelar({ usuarioId: principal.usuarioId }, id);
  }
}
