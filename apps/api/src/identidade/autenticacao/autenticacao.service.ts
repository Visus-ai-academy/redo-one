import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../clock';
import { PASSWORD_HASHER, type PasswordHasher } from '../senha/password-hasher';
import { SESSOES_REPOSITORY, type SessoesRepository } from '../sessoes/sessoes.repository';
import {
  type IdentificadorLogin,
  USUARIOS_REPOSITORY,
  type UsuariosRepository,
} from '../usuarios/usuarios.repository';
import { AcessoBloqueadoError, CredenciaisInvalidasError } from './autenticacao.errors';
import {
  TENTATIVAS_LOGIN_REPOSITORY,
  type TentativasLoginRepository,
} from './tentativas-login.repository';

const DIA = 24 * 60 * 60 * 1000;
const SESSAO_INATIVIDADE_MS = 7 * DIA;
const SESSAO_LIMITE_ABSOLUTO_MS = 30 * DIA;
const MAX_FALHAS_CONTA = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;
// Bem acima do limite da conta: a equipe sai pelo mesmo IP do escritório, e 5 falhas somadas de
// pessoas diferentes não podem bloquear todo mundo. O IP pega quem testa muitas contas.
const MAX_FALHAS_IP = 30;

export interface EntrarComando {
  /** E-mail ou CPF, como a pessoa digitou. */
  identificador: string;
  senha: string;
  ip: string;
  userAgent: string | null;
}

export interface SessaoAberta {
  /** Vai para o cookie; o banco guarda só o hash. */
  token: string;
  expiraEm: Date;
  usuario: { id: string; nome: string; email: string; papelId: string };
}

@Injectable()
export class AutenticacaoService {
  constructor(
    @Inject(USUARIOS_REPOSITORY) private readonly usuarios: UsuariosRepository,
    @Inject(SESSOES_REPOSITORY) private readonly sessoes: SessoesRepository,
    @Inject(TENTATIVAS_LOGIN_REPOSITORY) private readonly tentativas: TentativasLoginRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async entrar(comando: EntrarComando): Promise<SessaoAberta> {
    const agora = this.clock.now();

    const desde = new Date(agora.getTime() - BLOQUEIO_MS);
    if ((await this.tentativas.contarFalhasPorIp(comando.ip, desde)) >= MAX_FALHAS_IP) {
      throw new AcessoBloqueadoError(new Date(agora.getTime() + BLOQUEIO_MS));
    }

    const usuario = await this.usuarios.buscarParaLogin(lerIdentificador(comando.identificador));
    if (usuario?.bloqueadoAte && usuario.bloqueadoAte > agora) {
      await this.registrarTentativa(comando, usuario.id, false, agora);
      throw new AcessoBloqueadoError(usuario.bloqueadoAte);
    }

    const senhaConfere = await this.conferirSenha(usuario?.senhaHash ?? null, comando.senha);

    if (!usuario || !senhaConfere) {
      await this.registrarTentativa(comando, usuario?.id ?? null, false, agora);
      if (!usuario) throw new CredenciaisInvalidasError();

      const falhas = usuario.tentativasFalhas + 1;
      if (falhas < MAX_FALHAS_CONTA) {
        await this.usuarios.registrarFalha(usuario.id, falhas, null);
        throw new CredenciaisInvalidasError();
      }
      // Bloqueia e zera o contador: depois do bloqueio, a pessoa tem de novo 5 tentativas.
      const bloqueadoAte = new Date(agora.getTime() + BLOQUEIO_MS);
      await this.usuarios.registrarFalha(usuario.id, 0, bloqueadoAte);
      throw new AcessoBloqueadoError(bloqueadoAte);
    }

    if (!usuario.ativo) {
      await this.registrarTentativa(comando, usuario.id, false, agora);
      throw new CredenciaisInvalidasError();
    }

    await this.usuarios.registrarSucesso(usuario.id);
    await this.registrarTentativa(comando, usuario.id, true, agora);

    const token = randomBytes(32).toString('base64url');
    const expiraEm = new Date(agora.getTime() + SESSAO_INATIVIDADE_MS);
    await this.sessoes.criar({
      usuarioId: usuario.id,
      tokenHash: hashDoToken(token),
      criadaEm: agora,
      expiraEm,
      expiraAbsolutoEm: new Date(agora.getTime() + SESSAO_LIMITE_ABSOLUTO_MS),
      ip: comando.ip,
      userAgent: comando.userAgent,
    });

    const { id, nome, email, papelId } = usuario;
    return { token, expiraEm, usuario: { id, nome, email, papelId } };
  }

  private registrarTentativa(
    comando: EntrarComando,
    usuarioId: string | null,
    sucesso: boolean,
    em: Date,
  ) {
    return this.tentativas.registrar({
      ip: comando.ip,
      usuarioId,
      sucesso,
      userAgent: comando.userAgent,
      em,
    });
  }

  /**
   * Sem hash (usuário inexistente ou convite pendente), confere contra um hash fictício: a resposta
   * leva o mesmo tempo e não revela se a conta existe.
   */
  private async conferirSenha(hash: string | null, senha: string): Promise<boolean> {
    if (hash) return this.hasher.verify(hash, senha);
    this.hashFicticio ??= this.hasher.hash(randomBytes(16).toString('hex'));
    await this.hasher.verify(await this.hashFicticio, senha);
    return false;
  }

  private hashFicticio?: Promise<string>;
}

/** Com `@` é e-mail; sem, é CPF (só os dígitos, aceitando pontuação e espaços). */
function lerIdentificador(texto: string): IdentificadorLogin {
  if (texto.includes('@')) return { email: texto.trim().toLowerCase() };
  return { cpf: texto.replace(/\D/g, '') };
}

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
