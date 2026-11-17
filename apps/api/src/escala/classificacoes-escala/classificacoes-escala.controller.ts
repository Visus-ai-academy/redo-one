import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Permissao } from '../../identidade/acesso/decorators';
import { ClassificacoesEscalaService } from './classificacoes-escala.service';
import { ClassificacoesEscalaDto } from './dto/classificacoes-escala.dto';

/** Prioridades e subespecialidades da alocação, só com `escala.ver` (sem dar `catalogo.ver`). */
@ApiTags('escala')
@Controller('escala/classificacoes')
export class ClassificacoesEscalaController {
  constructor(private readonly service: ClassificacoesEscalaService) {}

  @Get()
  @Permissao('escala.ver')
  @ApiOkResponse({
    type: ClassificacoesEscalaDto,
    description: 'Listas inteiras, inativas inclusive, por ordem e nome.',
  })
  listar(): Promise<ClassificacoesEscalaDto> {
    return this.service.listar();
  }
}
