import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../clock';
import { emailConvite, emailRecuperacao } from '../emails';
import { abrirSessao, hashDoToken, type SessaoAberta } from '../sessoes/abrir-sessao';
import { SESSOES_REPOSITORY, type SessoesRepository } from '../sessoes/sessoes.repository';
import { USUARIOS_REPOSITORY, type UsuariosRepository } from '../usuarios/usuarios.repository';
import { PASSWORD_HASHER, type PasswordHasher } from './password-hasher';
import { problemasDaSenha } from './politica-senha';
import { LinkSenhaInvalidoError, SenhaFracaError } from './senha.errors';
import {
  type TipoTokenSenha,
  TOKENS_SENHA_REPOSITORY,
  type TokenSenhaEncontrado,
  type TokensSenhaRepository,
} from './tokens-senha.repository';

/** Endereço do front, para montar os links dos e-mails (`APP_URL`). */
export const URL_APP = Symbol('URL_APP');

const MIN = 60 * 1000;
const RECUPERACAO_VALIDADE_MS = 60 * MIN;
const CONVITE_VALIDADE_MS = 7 * 24 * 60 * MIN;
const INTERVALO_MINIMO_ENTRE_EMAILS_MS = MIN;

export interface InfoLink {
  tipo: TipoTokenSenha;
  nome: string;
  email: string;
  papel: string;
  convidadoPor: string | null;
}

/** Recuperação de senha e definição de senha por link (de recuperação ou de convite). */
@Injectable()
export class SenhaService {
  constructor(
    @Inject(USUARIOS_REPOSITORY) private readonly usuarios: UsuariosRepository,
    @Inject(TOKENS_SENHA_REPOSITORY) private readonly tokens: TokensSenhaRepository,
    @Inject(SESSOES_REPOSITORY) private readonly sessoes: SessoesRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(URL_APP) private readonly urlApp: string,
  ) {}

  /**
   * Manda o link de nova senha. Nunca diz se o e-mail existe: a resposta é a mesma com ou sem conta.
   * Convite pendente não recebe recuperação (quem administra reenvia o convite).
   */
  async solicitarRecuperacao(email: string): Promise<void> {
    const agora = this.clock.now();
    const usuario = await this.usuarios.buscarParaLogin({ email: email.trim().toLowerCase() });
    if (!usuario?.ativo || !usuario.senhaHash) return;

    const ultima = await this.tokens.ultimaEmissao(usuario.id, 'recuperacao');
    if (ultima && agora.getTime() - ultima.getTime() < INTERVALO_MINIMO_ENTRE_EMAILS_MS) return;

    await this.emitirRecuperacao(usuario, null);
  }

  /** Link de nova senha (1 hora). Também usado por quem administra, pela tela de Usuários. */
  async emitirRecuperacao(
    usuario: { id: string; nome: string; email: string },
    pedidoPorId: string | null,
  ): Promise<void> {
    const agora = this.clock.now();
    const token = randomBytes(32).toString('base64url');
    await this.tokens.emitir(
      {
        usuarioId: usuario.id,
        tipo: 'recuperacao',
        tokenHash: hashDoToken(token),
        criadoEm: agora,
        expiraEm: new Date(agora.getTime() + RECUPERACAO_VALIDADE_MS),
        criadoPorId: pedidoPorId,
      },
      emailRecuperacao({ para: usuario.email, nome: usuario.nome, link: this.link(token) }),
    );
  }

  /** Link de convite (7 dias) e o e-mail dele, para o convite e o reenvio. */
  prepararConvite(dados: {
    nome: string;
    email: string;
    papel: string;
    convidadoPor: { id: string; nome: string };
  }) {
    const agora = this.clock.now();
    const token = randomBytes(32).toString('base64url');
    return {
      token: {
        tipo: 'convite' as const,
        tokenHash: hashDoToken(token),
        criadoEm: agora,
        expiraEm: new Date(agora.getTime() + CONVITE_VALIDADE_MS),
        criadoPorId: dados.convidadoPor.id,
      },
      email: emailConvite({
        para: dados.email,
        nome: dados.nome,
        convidadoPor: dados.convidadoPor.nome,
        papel: dados.papel,
        link: this.link(token),
      }),
    };
  }

  /** Para a tela de definir senha mostrar de quem é a conta (e quem convidou). */
  async consultarLink(token: string): Promise<InfoLink> {
    const encontrado = await this.tokenValido(token);
    return {
      tipo: encontrado.tipo,
      nome: encontrado.usuario.nome,
      email: encontrado.usuario.email,
      papel: encontrado.usuario.papelNome,
      convidadoPor: encontrado.convidadoPorNome,
    };
  }

  /**
   * Grava a senha nova pelo link, encerra as outras sessões da pessoa e já abre uma sessão nova.
   * Senha fraca não gasta o link.
   */
  async definirSenha(comando: {
    token: string;
    senha: string;
    ip: string;
    userAgent: string | null;
  }): Promise<SessaoAberta> {
    const encontrado = await this.tokenValido(comando.token);
    const problemas = problemasDaSenha(comando.senha);
    if (problemas.length) throw new SenhaFracaError(problemas);

    const agora = this.clock.now();
    const hash = await this.hasher.hash(comando.senha);
    const usou = await this.tokens.usar(encontrado.id, encontrado.usuarioId, hash, agora);
    if (!usou) throw new LinkSenhaInvalidoError();

    await this.sessoes.encerrarDoUsuario(encontrado.usuarioId, agora);
    return abrirSessao(
      this.sessoes,
      { id: encontrado.usuarioId, ...encontrado.usuario },
      { ip: comando.ip, userAgent: comando.userAgent, agora },
    );
  }

  private async tokenValido(token: string): Promise<TokenSenhaEncontrado> {
    const encontrado = await this.tokens.buscarPorHash(hashDoToken(token));
    if (
      !encontrado ||
      encontrado.usadoEm ||
      encontrado.expiraEm <= this.clock.now() ||
      !encontrado.usuario.ativo
    ) {
      throw new LinkSenhaInvalidoError();
    }
    return encontrado;
  }

  private link(token: string) {
    return `${this.urlApp}/definir-senha?token=${token}`;
  }
}
