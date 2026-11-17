import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Permissao } from '../acesso/decorators';
import { CATALOGO_PERMISSOES, ROTULO_ACAO_PADRAO } from '../permissoes/catalogo';
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
      padrao: tela.padrao.map((a) => ({
        acao: a.acao,
        chave: `${tela.tela}.${a.acao}`,
        rotulo: a.rotulo ?? ROTULO_ACAO_PADRAO[a.acao],
        sensivel: !!a.sensivel,
      })),
      especiais: tela.especiais.map((e) => ({
        chave: e.chave,
        rotulo: e.rotulo,
        descricao: e.descricao,
        sensivel: !!e.sensivel,
        implica: [...(e.implica ?? [])],
      })),
      exige: [...(tela.exige ?? [])],
    }));
  }
}
