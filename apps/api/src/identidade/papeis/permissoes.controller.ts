import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Permissao } from '../acesso/decorators';
import { CATALOGO_PERMISSOES } from '../permissoes/catalogo';
import { TelaCatalogoDto } from './dto/papel.dto';

@ApiTags('identidade')
@Controller('permissoes')
export class PermissoesController {
  @Get()
  @Permissao('papeis.ver')
  @ApiOkResponse({ type: [TelaCatalogoDto], description: 'Tudo o que um papel pode conceder.' })
  catalogo(): TelaCatalogoDto[] {
    return CATALOGO_PERMISSOES.map((tela) => ({
      tela: tela.tela,
      rotulo: tela.rotulo,
      area: tela.area,
      acoes: tela.acoes.map((a) => ({ chave: a.chave, rotulo: a.rotulo, sensivel: !!a.sensivel })),
    }));
  }
}
