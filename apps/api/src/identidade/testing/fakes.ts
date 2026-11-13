// Implementações em memória para os testes do contexto `identidade`.
import type {
  TentativaLogin,
  TentativasLoginRepository,
} from '../autenticacao/tentativas-login.repository';
import type { Clock } from '../clock';
import type { PasswordHasher } from '../senha/password-hasher';
import type { NovaSessao, SessoesRepository } from '../sessoes/sessoes.repository';
import type {
  IdentificadorLogin,
  UsuarioLogin,
  UsuariosRepository,
} from '../usuarios/usuarios.repository';

/** Hash reversível e rápido: só para teste. */
export class FakePasswordHasher implements PasswordHasher {
  async hash(senha: string) {
    return `hash:${senha}`;
  }

  async verify(hash: string, senha: string) {
    return hash === `hash:${senha}`;
  }
}

export class FixedClock implements Clock {
  constructor(private atual: Date) {}

  now() {
    return new Date(this.atual);
  }

  avancar(ms: number) {
    this.atual = new Date(this.atual.getTime() + ms);
  }
}

export class InMemoryUsuariosRepository implements UsuariosRepository {
  constructor(public readonly usuarios: (UsuarioLogin & { cpf?: string | null })[] = []) {}

  async buscarParaLogin(identificador: IdentificadorLogin) {
    const achado = this.usuarios.find((u) =>
      'email' in identificador ? u.email === identificador.email : u.cpf === identificador.cpf,
    );
    return achado ? { ...achado } : null;
  }

  async registrarFalha(id: string, tentativasFalhas: number, bloqueadoAte: Date | null) {
    const usuario = this.porId(id);
    usuario.tentativasFalhas = tentativasFalhas;
    usuario.bloqueadoAte = bloqueadoAte;
  }

  async registrarSucesso(id: string) {
    const usuario = this.porId(id);
    usuario.tentativasFalhas = 0;
    usuario.bloqueadoAte = null;
  }

  porId(id: string) {
    const usuario = this.usuarios.find((u) => u.id === id);
    if (!usuario) throw new Error(`usuário ${id} não existe no fake`);
    return usuario;
  }
}

export class InMemorySessoesRepository implements SessoesRepository {
  readonly sessoes: NovaSessao[] = [];

  async criar(sessao: NovaSessao) {
    this.sessoes.push(sessao);
  }
}

export class InMemoryTentativasLoginRepository implements TentativasLoginRepository {
  readonly tentativas: TentativaLogin[] = [];

  async registrar(tentativa: TentativaLogin) {
    this.tentativas.push(tentativa);
  }

  async contarFalhasPorIp(ip: string, desde: Date) {
    return this.tentativas.filter((t) => t.ip === ip && !t.sucesso && t.em >= desde).length;
  }
}
