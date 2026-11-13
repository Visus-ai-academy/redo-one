// Implementações em memória para os testes do contexto `identidade`.

import type { Email } from '../../comum/email/envio-email';
import type {
  TentativaLogin,
  TentativasLoginRepository,
} from '../autenticacao/tentativas-login.repository';
import type { Clock } from '../clock';
import type { ContaRepository } from '../conta/conta.repository';
import type {
  DadosPapel,
  GestaoPapeisRepository,
  PapelDetalhe,
  PapelResumo,
} from '../papeis/gestao-papeis.repository';
import type { AcessoDoPapel, PapeisRepository } from '../papeis/papeis.repository';
import type {
  ChaveRobo,
  ChavesRoboRepository,
  NovaChaveRobo,
} from '../robos/chaves-robo.repository';
import type { PasswordHasher } from '../senha/password-hasher';
import type {
  NovoTokenSenha,
  TipoTokenSenha,
  TokenSenhaEncontrado,
  TokensSenhaRepository,
} from '../senha/tokens-senha.repository';
import type {
  NovaSessao,
  SessaoComUsuario,
  SessoesRepository,
} from '../sessoes/sessoes.repository';
import type {
  FiltroUsuarios,
  GestaoUsuariosRepository,
  NovoUsuario,
  SituacaoUsuario,
  UsuarioDetalhe,
  UsuarioResumo,
} from '../usuarios/gestao-usuarios.repository';
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

  async encerrarDoPapel(papelId: string, em: Date) {
    const abertas = this.sessoes.filter(
      (s) => !s.encerradaEm && this.usuarios?.porId(s.usuarioId).papelId === papelId,
    );
    for (const sessao of abertas) sessao.encerradaEm = em;
    return abertas.length;
  }

  async encerrarDoUsuario(usuarioId: string, em: Date, excetoSessaoId?: string) {
    const abertas = this.sessoes.filter(
      (s) => !s.encerradaEm && s.usuarioId === usuarioId && s.id !== excetoSessaoId,
    );
    for (const sessao of abertas) sessao.encerradaEm = em;
    return abertas.length;
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
    return this.acessos[papelId] ?? { papel: '', acessoTotal: false, permissoes: [] };
  }
}

export class InMemoryGestaoPapeisRepository implements GestaoPapeisRepository {
  constructor(
    public readonly papeis: PapelDetalhe[] = [],
    private readonly usuarios?: InMemoryUsuariosRepository,
  ) {}

  async listar(): Promise<PapelResumo[]> {
    return this.papeis.map(({ permissoes, ...papel }) => ({
      ...papel,
      totalUsuarios: this.totalUsuarios(papel.id),
      totalPermissoes: permissoes.length,
    }));
  }

  async buscar(id: string) {
    const papel = this.papeis.find((p) => p.id === id);
    return papel ? { ...papel, totalUsuarios: this.totalUsuarios(id) } : null;
  }

  async buscarPorNome(nome: string) {
    const papel = this.papeis.find((p) => p.nome.toLowerCase() === nome.toLowerCase());
    return papel ? { id: papel.id } : null;
  }

  async criar(dados: DadosPapel) {
    const id = `p-${this.papeis.length + 1}`;
    this.papeis.push({ id, sistema: false, acessoTotal: false, totalUsuarios: 0, ...dados });
    return id;
  }

  async atualizar(id: string, dados: DadosPapel) {
    Object.assign(this.porId(id), dados);
  }

  async excluir(id: string) {
    this.papeis.splice(this.papeis.indexOf(this.porId(id)), 1);
  }

  porId(id: string) {
    const papel = this.papeis.find((p) => p.id === id);
    if (!papel) throw new Error(`papel ${id} não existe no fake`);
    return papel;
  }

  private totalUsuarios(papelId: string) {
    return this.usuarios?.usuarios.filter((u) => u.papelId === papelId).length ?? 0;
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

export interface TokenSenhaGuardado extends NovoTokenSenha {
  id: string;
  usadoEm: Date | null;
}

export class InMemoryTokensSenhaRepository implements TokensSenhaRepository {
  readonly tokens: TokenSenhaGuardado[] = [];
  readonly emails: Email[] = [];

  constructor(
    private readonly usuarios: InMemoryUsuariosRepository,
    private readonly nomesDosPapeis: Record<string, string> = {},
  ) {}

  async emitir(token: NovoTokenSenha, email: Email) {
    for (const anterior of this.tokens) {
      if (anterior.usuarioId === token.usuarioId && anterior.tipo === token.tipo) {
        anterior.usadoEm ??= token.criadoEm;
      }
    }
    this.tokens.push({ ...token, id: `t-${this.tokens.length + 1}`, usadoEm: null });
    this.emails.push(email);
  }

  async buscarPorHash(tokenHash: string): Promise<TokenSenhaEncontrado | null> {
    const token = this.tokens.find((t) => t.tokenHash === tokenHash);
    if (!token) return null;
    const usuario = this.usuarios.porId(token.usuarioId);
    return {
      id: token.id,
      usuarioId: token.usuarioId,
      tipo: token.tipo,
      expiraEm: token.expiraEm,
      usadoEm: token.usadoEm,
      usuario: {
        nome: usuario.nome,
        email: usuario.email,
        papelId: usuario.papelId,
        papelNome: this.nomesDosPapeis[usuario.papelId] ?? usuario.papelId,
        ativo: usuario.ativo,
      },
      convidadoPorNome: token.criadoPorId ? this.usuarios.porId(token.criadoPorId).nome : null,
    };
  }

  async ultimaEmissao(usuarioId: string, tipo: TipoTokenSenha) {
    const datas = this.tokens
      .filter((t) => t.usuarioId === usuarioId && t.tipo === tipo)
      .map((t) => t.criadoEm.getTime());
    return datas.length ? new Date(Math.max(...datas)) : null;
  }

  async usar(tokenId: string, usuarioId: string, senhaHash: string, em: Date) {
    const token = this.tokens.find((t) => t.id === tokenId);
    if (!token || token.usadoEm) return false;
    token.usadoEm = em;
    Object.assign(this.usuarios.porId(usuarioId), {
      senhaHash,
      tentativasFalhas: 0,
      bloqueadoAte: null,
    });
    return true;
  }
}

export class InMemoryGestaoUsuariosRepository implements GestaoUsuariosRepository {
  constructor(
    private readonly usuarios: InMemoryUsuariosRepository,
    private readonly papeis: InMemoryGestaoPapeisRepository,
    private readonly sessoes: InMemorySessoesRepository,
    private readonly tokens: InMemoryTokensSenhaRepository,
  ) {}

  async listar(filtro: FiltroUsuarios) {
    const busca = filtro.busca?.toLowerCase();
    const todos = this.usuarios.usuarios
      .map((u) => this.resumo(u, filtro.agora))
      .filter(
        (u) =>
          (!busca || u.nome.toLowerCase().includes(busca) || u.email.includes(busca)) &&
          (!filtro.papelId || u.papel.id === filtro.papelId) &&
          (!filtro.situacao || u.situacao === filtro.situacao),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome));
    const inicio = (filtro.pagina - 1) * filtro.porPagina;
    return { itens: todos.slice(inicio, inicio + filtro.porPagina), total: todos.length };
  }

  async buscar(id: string, agora: Date): Promise<UsuarioDetalhe | null> {
    const usuario = this.usuarios.usuarios.find((u) => u.id === id);
    if (!usuario) return null;
    return {
      ...this.resumo(usuario, agora),
      cpfFinal: usuario.cpf ? usuario.cpf.slice(-2) : null,
      bloqueadoAte: usuario.bloqueadoAte,
      criadoEm: agora,
      sessoesAbertas: this.sessoes.sessoes
        .filter((s) => s.usuarioId === id && !s.encerradaEm)
        .map((s) => ({
          id: s.id,
          ip: s.ip,
          userAgent: s.userAgent,
          criadaEm: s.criadaEm,
          ultimoUsoEm: s.ultimoUsoEm,
        })),
    };
  }

  async existeEmail(email: string) {
    return this.usuarios.usuarios.some((u) => u.email === email);
  }

  async existeCpf(cpf: string) {
    return this.usuarios.usuarios.some((u) => u.cpf === cpf);
  }

  async convidar(
    novo: NovoUsuario,
    token: Omit<NovoTokenSenha, 'usuarioId'>,
    email: (usuarioId: string) => Email,
  ) {
    const id = `u-${this.usuarios.usuarios.length + 1}`;
    this.usuarios.usuarios.push({
      id,
      ...novo,
      senhaHash: null,
      ativo: true,
      tentativasFalhas: 0,
      bloqueadoAte: null,
    });
    await this.tokens.emitir({ ...token, usuarioId: id }, email(id));
    return id;
  }

  async trocarPapel(id: string, papelId: string) {
    this.usuarios.porId(id).papelId = papelId;
  }

  async definirAtivo(id: string, ativo: boolean) {
    this.usuarios.porId(id).ativo = ativo;
  }

  async desbloquear(id: string) {
    Object.assign(this.usuarios.porId(id), { tentativasFalhas: 0, bloqueadoAte: null });
  }

  private resumo(u: UsuarioLogin, agora: Date): UsuarioResumo {
    const situacao: SituacaoUsuario = !u.ativo
      ? 'desativado'
      : !u.senhaHash
        ? 'convite_pendente'
        : u.bloqueadoAte && u.bloqueadoAte > agora
          ? 'bloqueado'
          : 'ativo';
    const usos = this.sessoes.sessoes
      .filter((s) => s.usuarioId === u.id)
      .map((s) => s.ultimoUsoEm.getTime());
    return {
      id: u.id,
      nome: u.nome,
      email: u.email,
      papel: {
        id: u.papelId,
        nome: this.papeis.papeis.find((p) => p.id === u.papelId)?.nome ?? '',
      },
      situacao,
      ultimoAcessoEm: usos.length ? new Date(Math.max(...usos)) : null,
    };
  }
}

export class InMemoryContaRepository implements ContaRepository {
  readonly senhasAlteradasEm = new Map<string, Date>();

  constructor(
    private readonly usuarios: InMemoryUsuariosRepository,
    private readonly tentativas: InMemoryTentativasLoginRepository,
  ) {}

  async senha(usuarioId: string) {
    return {
      hash: this.usuarios.porId(usuarioId).senhaHash,
      alteradaEm: this.senhasAlteradasEm.get(usuarioId) ?? null,
    };
  }

  async atualizarNome(usuarioId: string, nome: string) {
    this.usuarios.porId(usuarioId).nome = nome;
  }

  async trocarSenha(usuarioId: string, hash: string, em: Date) {
    this.usuarios.porId(usuarioId).senhaHash = hash;
    this.senhasAlteradasEm.set(usuarioId, em);
  }

  async acessosRecentes(usuarioId: string, desde: Date, limite: number) {
    return this.tentativas.tentativas
      .filter((t) => t.usuarioId === usuarioId && t.em >= desde)
      .sort((a, b) => b.em.getTime() - a.em.getTime())
      .slice(0, limite)
      .map((t) => ({ em: t.em, sucesso: t.sucesso, ip: t.ip, userAgent: t.userAgent }));
  }
}

export class InMemoryChavesRoboRepository implements ChavesRoboRepository {
  readonly chaves: (ChaveRobo & { tokenHash: string; criadaPorId: string })[] = [];
  usosRegistrados = 0;

  async listar() {
    return this.chaves.map(({ tokenHash, criadaPorId, ...chave }) => chave);
  }

  async buscar(id: string) {
    return (await this.listar()).find((c) => c.id === id) ?? null;
  }

  async buscarPorHash(tokenHash: string) {
    const achada = this.chaves.find((c) => c.tokenHash === tokenHash);
    return achada ? this.buscar(achada.id) : null;
  }

  async criar(chave: NovaChaveRobo) {
    const id = `k-${this.chaves.length + 1}`;
    this.chaves.push({ ...chave, id, revogadaEm: null, ultimoUsoEm: null, ultimoIp: null });
    return id;
  }

  async revogar(id: string, em: Date) {
    this.porId(id).revogadaEm = em;
  }

  async registrarUso(id: string, em: Date, ip: string) {
    Object.assign(this.porId(id), { ultimoUsoEm: em, ultimoIp: ip });
    this.usosRegistrados++;
  }

  porId(id: string) {
    const chave = this.chaves.find((c) => c.id === id);
    if (!chave) throw new Error(`chave ${id} não existe no fake`);
    return chave;
  }
}
