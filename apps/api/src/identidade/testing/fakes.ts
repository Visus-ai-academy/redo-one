// Implementações em memória para os testes do contexto `identidade`.
import type {
  TentativaLogin,
  TentativasLoginRepository,
} from '../autenticacao/tentativas-login.repository';
import type { Clock } from '../clock';
import type { AcessoDoPapel, PapeisRepository } from '../papeis/papeis.repository';
import type { PasswordHasher } from '../senha/password-hasher';
import type {
  NovaSessao,
  SessaoComUsuario,
  SessoesRepository,
} from '../sessoes/sessoes.repository';
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

export interface SessaoGuardada extends NovaSessao {
  id: string;
  ultimoUsoEm: Date;
  encerradaEm: Date | null;
}

export class InMemorySessoesRepository implements SessoesRepository {
  readonly sessoes: SessaoGuardada[] = [];
  /** Quantas vezes `renovar` gravou: para conferir que usos seguidos não regravam. */
  renovacoes = 0;

  constructor(private readonly usuarios?: InMemoryUsuariosRepository) {}

  async criar(sessao: NovaSessao) {
    this.sessoes.push({
      ...sessao,
      id: `s-${this.sessoes.length + 1}`,
      ultimoUsoEm: sessao.criadaEm,
      encerradaEm: null,
    });
  }

  async buscarPorTokenHash(tokenHash: string): Promise<SessaoComUsuario | null> {
    const sessao = this.sessoes.find((s) => s.tokenHash === tokenHash);
    if (!sessao || !this.usuarios) return null;
    const { nome, email, papelId, ativo } = this.usuarios.porId(sessao.usuarioId);
    return {
      id: sessao.id,
      usuarioId: sessao.usuarioId,
      expiraEm: sessao.expiraEm,
      expiraAbsolutoEm: sessao.expiraAbsolutoEm,
      ultimoUsoEm: sessao.ultimoUsoEm,
      encerradaEm: sessao.encerradaEm,
      usuario: { nome, email, papelId, ativo },
    };
  }

  async renovar(id: string, expiraEm: Date, ultimoUsoEm: Date) {
    Object.assign(this.porId(id), { expiraEm, ultimoUsoEm });
    this.renovacoes++;
  }

  async encerrar(id: string, em: Date) {
    this.porId(id).encerradaEm = em;
  }

  porId(id: string) {
    const sessao = this.sessoes.find((s) => s.id === id);
    if (!sessao) throw new Error(`sessão ${id} não existe no fake`);
    return sessao;
  }
}

export class InMemoryPapeisRepository implements PapeisRepository {
  constructor(public readonly acessos: Record<string, AcessoDoPapel> = {}) {}

  async acessoDoPapel(papelId: string) {
    return this.acessos[papelId] ?? { acessoTotal: false, permissoes: [] };
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
