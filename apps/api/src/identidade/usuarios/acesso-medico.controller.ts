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
  AcessoMedicoDto,
  BuscarContasDto,
  ContaParaLigarDto,
  ConviteMedicoDto,
  LigarContaDto,
} from './dto/acesso-medico.dto';
import { PapelAtribuivelDto, UsuarioCriadoDto } from './dto/usuario.dto';
import { UsuariosService } from './usuarios.service';

const MedicoId = () => Param('medicoId', ParseUUIDPipe);

/**
 * Aba Acesso do painel do médico: a conta do portal ligada a ele. Usa as chaves
 * `medicos.acesso.*`, não as da tela Usuários (senha, bloqueio e sessões continuam lá), com as
 * mesmas regras e auditoria do `UsuariosService`.
 */
@ApiTags('identidade')
@Controller('medicos/:medicoId/acesso')
export class AcessoMedicoController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @Permissao('medicos.acesso.ver')
  @ApiOkResponse({ type: AcessoMedicoDto })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  async obter(@MedicoId() medicoId: string): Promise<AcessoMedicoDto> {
    return { conta: await this.usuarios.contaDoMedico(medicoId) };
  }

  @Get('papeis')
  @Permissao('medicos.acesso.editar')
  @ApiOkResponse({
    type: [PapelAtribuivelDto],
    description: 'Papéis para o convite, marcando os que quem está logado pode dar.',
  })
  papeis(
    @PrincipalAtual() eu: PrincipalUsuario,
    // Só para a rota documentar o parâmetro: os papéis não dependem do médico.
    @MedicoId() _medicoId: string,
  ): Promise<PapelAtribuivelDto[]> {
    return this.usuarios.papeisParaAtribuir(eu);
  }

  @Get('contas')
  @Permissao('medicos.acesso.editar')
  @ApiOkResponse({
    type: [ContaParaLigarDto],
    description: 'Até 20 contas, ainda sem médico ligado, que casam com a busca.',
  })
  async buscarContas(
    // Só para a rota documentar o parâmetro: a busca é nas contas ainda sem médico.
    @MedicoId() _medicoId: string,
    @Query() query: BuscarContasDto,
  ): Promise<ContaParaLigarDto[]> {
    const { itens } = await this.usuarios.listar({
      busca: query.busca,
      semMedico: true,
      pagina: 1,
      porPagina: 20,
    });
    return itens.map(({ id, nome, email }) => ({ id, nome, email }));
  }

  @Post('convite')
  @Permissao('medicos.acesso.editar')
  @ApiCreatedResponse({ type: UsuarioCriadoDto, description: 'Conta criada e convite enviado.' })
  @ApiConflictResponse({ description: 'E-mail já cadastrado ou médico já com acesso.' })
  @ApiForbiddenResponse({ description: 'Papel com permissões que quem convida não tem.' })
  async convidar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @MedicoId() medicoId: string,
    @Body() corpo: ConviteMedicoDto,
  ): Promise<UsuarioCriadoDto> {
    const { papelId, ...dados } = corpo;
    const id = await this.usuarios.convidar(ator, {
      ...dados,
      papelIds: [papelId],
      cpf: null,
      medicoId,
    });
    return { id };
  }

  @Put()
  @Permissao('medicos.acesso.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Conta ligada ao médico; as sessões dela foram encerradas.',
  })
  @ApiNotFoundResponse({ description: 'Usuário ou médico não encontrado.' })
  @ApiConflictResponse({ description: 'O médico já tem acesso por outra conta.' })
  ligar(
    @PrincipalAtual() ator: PrincipalUsuario,
    @MedicoId() medicoId: string,
    @Body() corpo: LigarContaDto,
  ): Promise<void> {
    return this.usuarios.vincularMedico(ator, corpo.usuarioId, medicoId);
  }

  @Delete()
  @Permissao('medicos.acesso.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Conta desligada; as sessões dela foram encerradas.' })
  @ApiNotFoundResponse({ description: 'Médico não encontrado.' })
  desligar(@PrincipalAtual() ator: PrincipalUsuario, @MedicoId() medicoId: string): Promise<void> {
    return this.usuarios.desligarMedico(ator, medicoId);
  }
}
