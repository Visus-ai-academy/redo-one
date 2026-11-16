import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { ListarHistoricoDto, PaginaHistoricoDto } from './dto/historico.dto';
import { HistoricoEscalaService } from './historico.service';

@ApiTags('escala')
@Controller('escala/historico')
export class HistoricoEscalaController {
  constructor(private readonly historico: HistoricoEscalaService) {}

  @Get()
  @Permissao('escala.historico.ver')
  @ApiOkResponse({
    type: PaginaHistoricoDto,
    description: 'Do mais novo, no recorte de quem consulta.',
  })
  @ApiBadRequestResponse({ description: 'Período inválido.' })
  async listar(
    @PrincipalAtual() principal: PrincipalUsuario,
    @Query() query: ListarHistoricoDto,
  ): Promise<PaginaHistoricoDto> {
    const { itens, total } = await this.historico.listar(
      { usuarioId: principal.usuarioId, acessoTotal: principal.acessoTotal },
      {
        ...(query.medicoId ? { medicoId: query.medicoId } : {}),
        ...(query.entidade ? { entidade: query.entidade } : {}),
        ...(query.de ? { de: query.de } : {}),
        ...(query.ate ? { ate: query.ate } : {}),
        pagina: query.pagina,
        porPagina: query.porPagina,
      },
    );
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }
}
