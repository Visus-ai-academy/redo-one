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
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Permissao, PrincipalAtual } from '../acesso/decorators';
import type { PrincipalUsuario } from '../principal';
import {
  PapelAtualizadoDto,
  PapelCriadoDto,
  PapelDetalheDto,
  PapelDto,
  PapelResumoDto,
} from './dto/papel.dto';
import { PapeisService } from './papeis.service';

@ApiTags('identidade')
@Controller('papeis')
export class PapeisController {
  constructor(private readonly papeis: PapeisService) {}

  @Get()
  @Permissao('papeis.ver')
  @ApiOkResponse({ type: [PapelResumoDto] })
  listar(): Promise<PapelResumoDto[]> {
    return this.papeis.listar();
  }

  @Get(':id')
  @Permissao('papeis.ver')
  @ApiOkResponse({ type: PapelDetalheDto })
  @ApiNotFoundResponse()
  obter(@Param('id', ParseUUIDPipe) id: string): Promise<PapelDetalheDto> {
    return this.papeis.obter(id);
  }

  @Post()
  @Permissao('papeis.criar')
  @ApiCreatedResponse({ type: PapelCriadoDto })
  @ApiConflictResponse({ description: 'Nome já usado.' })
  @ApiForbiddenResponse({ description: 'Concede permissão que quem pede não tem.' })
  async criar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: PapelDto,
  ): Promise<PapelCriadoDto> {
    return { id: await this.papeis.criar(ator, dados(corpo)) };
  }

  @Put(':id')
  @Permissao('papeis.editar')
  @ApiOkResponse({ type: PapelAtualizadoDto })
  @ApiConflictResponse({
    description: 'Nome já usado, nome de papel do sistema ou papel de acesso total.',
  })
  atualizar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: PapelDto,
  ): Promise<PapelAtualizadoDto> {
    return this.papeis.atualizar(ator, id, dados(corpo));
  }

  @Delete(':id')
  @Permissao('papeis.excluir')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'Papel com usuários ou papel do sistema.' })
  excluir(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.papeis.excluir(ator, id);
  }
}

function dados(corpo: PapelDto) {
  return { nome: corpo.nome, descricao: corpo.descricao ?? null, permissoes: corpo.permissoes };
}
