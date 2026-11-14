import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
  ConviteUsuarioDto,
  ListarUsuariosDto,
  PaginaUsuariosDto,
  PapelAtribuivelDto,
  TrocarPapelDto,
  UsuarioCriadoDto,
  UsuarioDetalheDto,
} from './dto/usuario.dto';
import { UsuariosService } from './usuarios.service';

const Id = () => Param('id', ParseUUIDPipe);

@ApiTags('identidade')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @Permissao('usuarios.ver')
  @ApiOkResponse({ type: PaginaUsuariosDto })
  async listar(@Query() query: ListarUsuariosDto): Promise<PaginaUsuariosDto> {
    const { itens, total } = await this.usuarios.listar({
      busca: query.busca,
      papelId: query.papelId,
      situacao: query.situacao,
      pagina: query.pagina,
      porPagina: query.porPagina,
    });
    return { itens, total, pagina: query.pagina, porPagina: query.porPagina };
  }

  // Antes de :id, senão a rota :id capturaria "papeis".
  @Get('papeis')
  @Permissao('usuarios.ver')
  @ApiOkResponse({
    type: [PapelAtribuivelDto],
    description: 'Papéis para os seletores da tela Usuários, marcando os que se pode atribuir.',
  })
  papeis(@PrincipalAtual() eu: PrincipalUsuario): Promise<PapelAtribuivelDto[]> {
    return this.usuarios.papeisParaAtribuir(eu);
  }

  @Get(':id')
  @Permissao('usuarios.ver')
  @ApiOkResponse({ type: UsuarioDetalheDto })
  @ApiNotFoundResponse()
  obter(@Id() id: string): Promise<UsuarioDetalheDto> {
    return this.usuarios.obter(id);
  }

  @Post()
  @Permissao('usuarios.convidar')
  @ApiCreatedResponse({ type: UsuarioCriadoDto, description: 'Conta criada e convite enviado.' })
  @ApiConflictResponse({ description: 'E-mail ou CPF já cadastrados.' })
  @ApiForbiddenResponse({ description: 'Papel com permissões que quem convida não tem.' })
  async convidar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Body() corpo: ConviteUsuarioDto,
  ): Promise<UsuarioCriadoDto> {
    const id = await this.usuarios.convidar(ator, { ...corpo, cpf: corpo.cpf ?? null });
    return { id };
  }

  @Post(':id/convite')
  @Permissao('usuarios.convidar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Convite reenviado; o link anterior deixa de valer.' })
  reenviarConvite(@PrincipalAtual() ator: PrincipalUsuario, @Id() id: string): Promise<void> {
    return this.usuarios.reenviarConvite(ator, id);
  }

  @Patch(':id/papel')
  @Permissao('usuarios.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Papel trocado; as sessões da pessoa foram encerradas.' })
  trocarPapel(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Id() id: string,
    @Body() corpo: TrocarPapelDto,
  ): Promise<void> {
    return this.usuarios.trocarPapel(ator, id, corpo.papelId);
  }

  @Post(':id/desbloquear')
  @Permissao('usuarios.desbloquear')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  desbloquear(@PrincipalAtual() ator: PrincipalUsuario, @Id() id: string): Promise<void> {
    return this.usuarios.desbloquear(ator, id);
  }

  @Post(':id/desativar')
  @Permissao('usuarios.desativar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Conta desativada; as sessões foram encerradas.' })
  desativar(@PrincipalAtual() ator: PrincipalUsuario, @Id() id: string): Promise<void> {
    return this.usuarios.desativar(ator, id);
  }

  @Post(':id/reativar')
  @Permissao('usuarios.desativar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  reativar(@PrincipalAtual() ator: PrincipalUsuario, @Id() id: string): Promise<void> {
    return this.usuarios.reativar(ator, id);
  }

  @Post(':id/link-senha')
  @Permissao('usuarios.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Link de nova senha (1 hora) enviado à pessoa.' })
  enviarLinkSenha(@PrincipalAtual() ator: PrincipalUsuario, @Id() id: string): Promise<void> {
    return this.usuarios.enviarLinkSenha(ator, id);
  }

  @Delete(':id/sessoes')
  @Permissao('usuarios.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Todas as sessões da pessoa foram encerradas.' })
  encerrarSessoes(@PrincipalAtual() ator: PrincipalUsuario, @Id() id: string): Promise<void> {
    return this.usuarios.encerrarSessoes(ator, id);
  }

  @Delete(':id/sessoes/:sessaoId')
  @Permissao('usuarios.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  encerrarSessao(
    @PrincipalAtual() ator: PrincipalUsuario,
    @Id() id: string,
    @Param('sessaoId', ParseUUIDPipe) sessaoId: string,
  ): Promise<void> {
    return this.usuarios.encerrarSessoes(ator, id, sessaoId);
  }
}
