import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { CLOCK, type Clock } from '../clock';
import {
  GESTAO_PAPEIS_REPOSITORY,
  type GestaoPapeisRepository,
  type PapelDetalhe,
} from '../papeis/gestao-papeis.repository';
import { PapelNaoEncontradoError } from '../papeis/papeis.errors';
import { type PrincipalUsuario, temPermissao } from '../principal';
import { SenhaService } from '../senha/senha.service';
import {
  TOKENS_SENHA_REPOSITORY,
  type TokensSenhaRepository,
} from '../senha/tokens-senha.repository';
import { SESSOES_REPOSITORY, type SessoesRepository } from '../sessoes/sessoes.repository';
import {
  type FiltroUsuarios,
  GESTAO_USUARIOS_REPOSITORY,
  type GestaoUsuariosRepository,
  type UsuarioDetalhe,
  type UsuarioResumo,
} from './gestao-usuarios.repository';
import {
  AcaoSobreSiMesmoError,
  ConviteJaAceitoError,
  ConvitePendenteError,
  CpfEmUsoError,
  CpfInvalidoError,
  EmailEmUsoError,
  PapelNaoAtribuivelError,
  SessaoNaoEncontradaError,
  UsuarioNaoEncontradoError,
} from './usuarios.errors';

export interface ConviteUsuario {
  nome: string;
  email: string;
  /** Com ou sem pontuação; opcional (permite entrar pelo CPF). */
  cpf: string | null;
  papelId: string;
}

@Injectable()
export class UsuariosService {
  constructor(
    @Inject(GESTAO_USUARIOS_REPOSITORY) private readonly usuarios: GestaoUsuariosRepository,
    @Inject(GESTAO_PAPEIS_REPOSITORY) private readonly papeis: GestaoPapeisRepository,
    @Inject(SESSOES_REPOSITORY) private readonly sessoes: SessoesRepository,
    @Inject(TOKENS_SENHA_REPOSITORY) private readonly tokens: TokensSenhaRepository,
    private readonly senha: SenhaService,
    @Inject(AUDITORIA) private readonly auditoria: Auditoria,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  listar(
    filtro: Omit<FiltroUsuarios, 'agora'>,
  ): Promise<{ itens: UsuarioResumo[]; total: number }> {
    return this.usuarios.listar({ ...filtro, agora: this.clock.now() });
  }

  async obter(id: string): Promise<UsuarioDetalhe> {
    const usuario = await this.usuarios.buscar(id, this.clock.now());
    if (!usuario) throw new UsuarioNaoEncontradoError();
    return usuario;
  }

  async convidar(ator: PrincipalUsuario, dados: ConviteUsuario): Promise<string> {
    const nome = dados.nome.trim();
    const email = dados.email.trim().toLowerCase();
    const cpf = dados.cpf ? dados.cpf.replace(/\D/g, '') : null;
    if (cpf !== null && cpf.length !== 11) throw new CpfInvalidoError();
    if (await this.usuarios.existeEmail(email)) throw new EmailEmUsoError();
    if (cpf && (await this.usuarios.existeCpf(cpf))) throw new CpfEmUsoError();
    const papel = await this.papelAtribuivel(ator, dados.papelId);

    const convite = this.senha.prepararConvite({
      nome,
      email,
      papel: papel.nome,
      convidadoPor: { id: ator.usuarioId, nome: ator.nome },
    });
    const id = await this.usuarios.convidar(
      { nome, email, cpf, papelId: papel.id },
      convite.token,
      () => convite.email,
    );
    await this.auditar(ator, id, 'convidado', undefined, { nome, email, papelId: papel.id });
    return id;
  }

  async reenviarConvite(ator: PrincipalUsuario, id: string): Promise<void> {
    const usuario = await this.obter(id);
    if (usuario.situacao !== 'convite_pendente') throw new ConviteJaAceitoError();
    const convite = this.senha.prepararConvite({
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel.nome,
      convidadoPor: { id: ator.usuarioId, nome: ator.nome },
    });
    await this.tokens.emitir({ ...convite.token, usuarioId: id }, convite.email);
    await this.auditar(ator, id, 'convite_reenviado');
  }

  /** Troca o papel e encerra as sessões da pessoa: o acesso novo vale na hora. */
  async trocarPapel(ator: PrincipalUsuario, id: string, papelId: string): Promise<void> {
    if (id === ator.usuarioId) throw new AcaoSobreSiMesmoError();
    const usuario = await this.obter(id);
    const papel = await this.papelAtribuivel(ator, papelId);
    await this.usuarios.trocarPapel(id, papel.id);
    await this.sessoes.encerrarDoUsuario(id, this.clock.now());
    await this.auditar(ator, id, 'papel_trocado', { papelId: usuario.papel.id }, { papelId });
  }

  async desbloquear(ator: PrincipalUsuario, id: string): Promise<void> {
    const usuario = await this.obter(id);
    await this.usuarios.desbloquear(id);
    await this.auditar(ator, id, 'desbloqueado', { bloqueadoAte: usuario.bloqueadoAte });
  }

  async desativar(ator: PrincipalUsuario, id: string): Promise<void> {
    if (id === ator.usuarioId) throw new AcaoSobreSiMesmoError();
    await this.obter(id);
    await this.usuarios.definirAtivo(id, false);
    await this.sessoes.encerrarDoUsuario(id, this.clock.now());
    await this.auditar(ator, id, 'desativado');
  }

  async reativar(ator: PrincipalUsuario, id: string): Promise<void> {
    await this.obter(id);
    await this.usuarios.definirAtivo(id, true);
    await this.auditar(ator, id, 'reativado');
  }

  /** Sem `sessaoId`, encerra todas as sessões abertas da pessoa. */
  async encerrarSessoes(ator: PrincipalUsuario, id: string, sessaoId?: string): Promise<void> {
    const usuario = await this.obter(id);
    const agora = this.clock.now();
    if (sessaoId) {
      if (!usuario.sessoesAbertas.some((s) => s.id === sessaoId)) {
        throw new SessaoNaoEncontradaError();
      }
      await this.sessoes.encerrar(sessaoId, agora);
    } else {
      await this.sessoes.encerrarDoUsuario(id, agora);
    }
    await this.auditar(ator, id, 'sessoes_encerradas', undefined, {
      sessaoId: sessaoId ?? 'todas',
    });
  }

  async enviarLinkSenha(ator: PrincipalUsuario, id: string): Promise<void> {
    const usuario = await this.obter(id);
    if (usuario.situacao === 'convite_pendente') throw new ConvitePendenteError();
    await this.senha.emitirRecuperacao(usuario, ator.usuarioId);
    await this.auditar(ator, id, 'link_senha_enviado');
  }

  private async papelAtribuivel(ator: PrincipalUsuario, papelId: string): Promise<PapelDetalhe> {
    const papel = await this.papeis.buscar(papelId);
    if (!papel) throw new PapelNaoEncontradoError();
    if (ator.acessoTotal) return papel;
    if (papel.acessoTotal || !papel.permissoes.every((chave) => temPermissao(ator, chave))) {
      throw new PapelNaoAtribuivelError();
    }
    return papel;
  }

  private auditar(
    ator: PrincipalUsuario,
    usuarioId: string,
    acao: string,
    antes?: Record<string, unknown>,
    depois?: Record<string, unknown>,
  ) {
    return this.auditoria.registrar({
      ator: { tipo: 'usuario', id: ator.usuarioId },
      entidade: 'usuario',
      entidadeId: usuarioId,
      acao,
      antes,
      depois,
      em: this.clock.now(),
    });
  }
}
