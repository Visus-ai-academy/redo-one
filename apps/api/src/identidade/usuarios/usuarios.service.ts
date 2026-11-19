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
  MedicoJaTemAcessoError,
  MedicoNaoEncontradoError,
  PapelNaoAtribuivelError,
  SemPapelError,
  SessaoNaoEncontradaError,
  UsuarioNaoEncontradoError,
} from './usuarios.errors';

export interface ConviteUsuario {
  nome: string;
  email: string;
  /** Com ou sem pontuação; opcional (permite entrar pelo CPF). */
  cpf: string | null;
  /** Um ou mais; as permissões da pessoa são a união das deles. */
  papelIds: string[];
  /** Liga a conta ao médico (portal); só um usuário por médico. */
  medicoId?: string | null;
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
    const papeis = await this.papeisAtribuiveis(ator, normalizar(dados.papelIds));
    const papelIds = papeis.map((p) => p.id);
    const medicoId = dados.medicoId ?? null;
    if (medicoId) await this.garantirMedicoLivre(medicoId, null);

    const convite = this.senha.prepararConvite({
      nome,
      email,
      papel: nomesDosPapeis(papeis),
      convidadoPor: { id: ator.usuarioId, nome: ator.nome },
    });
    const id = await this.usuarios.convidar(
      { nome, email, cpf, papelIds, medicoId },
      convite.token,
      () => convite.email,
    );
    await this.auditar(ator, id, 'convidado', undefined, {
      nome,
      email,
      papelIds,
      ...(medicoId ? { medicoId } : {}),
    });
    return id;
  }

  async reenviarConvite(ator: PrincipalUsuario, id: string): Promise<void> {
    const usuario = await this.obter(id);
    if (usuario.situacao !== 'convite_pendente') throw new ConviteJaAceitoError();
    const convite = this.senha.prepararConvite({
      nome: usuario.nome,
      email: usuario.email,
      papel: nomesDosPapeis(usuario.papeis),
      convidadoPor: { id: ator.usuarioId, nome: ator.nome },
    });
    await this.tokens.emitir({ ...convite.token, usuarioId: id }, convite.email);
    await this.auditar(ator, id, 'convite_reenviado');
  }

  /**
   * Troca os papéis e encerra as sessões da pessoa: o acesso novo vale na hora. Quem troca só põe
   * ou tira papel que poderia atribuir; os que ficam como estão não contam.
   */
  async trocarPapeis(ator: PrincipalUsuario, id: string, papelIds: string[]): Promise<void> {
    if (id === ator.usuarioId) throw new AcaoSobreSiMesmoError();
    const usuario = await this.obter(id);
    const antes = normalizar(
      usuario.papeis.map((p) => p.id),
      false,
    );
    const depois = normalizar(papelIds);
    const mexidos = [
      ...depois.filter((p) => !antes.includes(p)),
      ...antes.filter((p) => !depois.includes(p)),
    ];
    if (mexidos.length === 0) return;
    await this.papeisAtribuiveis(ator, mexidos);
    await this.usuarios.trocarPapeis(id, depois);
    await this.sessoes.encerrarDoUsuario(id, this.clock.now());
    await this.auditar(ator, id, 'papel_trocado', { papelIds: antes }, { papelIds: depois });
  }

  /**
   * Liga a conta ao médico (ou desliga, com `null`). Muda o que a pessoa enxerga no portal, então
   * as sessões dela são encerradas, como na troca de papel.
   */
  async vincularMedico(ator: PrincipalUsuario, id: string, medicoId: string | null): Promise<void> {
    await this.obter(id);
    const atual = await this.usuarios.medicoDoUsuario(id);
    if (atual === medicoId) return;
    if (medicoId) await this.garantirMedicoLivre(medicoId, id);
    await this.usuarios.vincularMedico(id, medicoId);
    await this.sessoes.encerrarDoUsuario(id, this.clock.now());
    if (medicoId) {
      await this.auditar(ator, id, 'medico_vinculado', { medicoId: atual }, { medicoId });
    } else {
      await this.auditar(ator, id, 'medico_desvinculado', { medicoId: atual });
    }
  }

  /** A conta ligada ao médico (aba Acesso do painel do médico), ou `null` se ele não tem. */
  async contaDoMedico(medicoId: string): Promise<UsuarioResumo | null> {
    if (!(await this.usuarios.buscarMedico(medicoId))) throw new MedicoNaoEncontradoError();
    const { itens } = await this.listar({ medicoId, pagina: 1, porPagina: 1 });
    return itens[0] ?? null;
  }

  /** Desliga a conta do médico, se houver; mesma regra e auditoria de `vincularMedico`. */
  async desligarMedico(ator: PrincipalUsuario, medicoId: string): Promise<void> {
    const conta = await this.contaDoMedico(medicoId);
    if (conta) await this.vincularMedico(ator, conta.id, null);
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

  /**
   * Papéis para os seletores da tela Usuários (filtro, convite, troca de papel), com `atribuivel`
   * pela mesma regra que vale ao salvar. Não exige `papeis.ver`: quem gere usuários precisa
   * escolher o papel sem poder abrir a tela Papéis.
   */
  async papeisParaAtribuir(
    ator: PrincipalUsuario,
  ): Promise<{ id: string; nome: string; atribuivel: boolean }[]> {
    const resumos = await this.papeis.listar();
    // Poucos papéis (dezenas no máximo): buscar cada um traz as permissões sem uma consulta nova.
    const detalhes = await Promise.all(resumos.map((p) => this.papeis.buscar(p.id)));
    return detalhes
      .filter((papel): papel is PapelDetalhe => papel !== null)
      .map((papel) => ({ id: papel.id, nome: papel.nome, atribuivel: podeAtribuir(ator, papel) }));
  }

  private async garantirMedicoLivre(medicoId: string, usuarioId: string | null) {
    if (!(await this.usuarios.buscarMedico(medicoId))) throw new MedicoNaoEncontradoError();
    const dono = await this.usuarios.usuarioDoMedico(medicoId);
    if (dono && dono.id !== usuarioId) throw new MedicoJaTemAcessoError(dono.nome);
  }

  private async papeisAtribuiveis(
    ator: PrincipalUsuario,
    papelIds: string[],
  ): Promise<PapelDetalhe[]> {
    const papeis = await Promise.all(papelIds.map((id) => this.papeis.buscar(id)));
    return papeis.map((papel) => {
      if (!papel) throw new PapelNaoEncontradoError();
      if (!podeAtribuir(ator, papel)) throw new PapelNaoAtribuivelError();
      return papel;
    });
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

/** Sem repetição e em ordem estável (para comparar e auditar). Vazio é recusado. */
function normalizar(papelIds: string[], exigir = true): string[] {
  const unicos = [...new Set(papelIds)].sort();
  if (exigir && unicos.length === 0) throw new SemPapelError();
  return unicos;
}

/** Para o e-mail e a tela do convite: "Coordenação, Financeiro". */
function nomesDosPapeis(papeis: { nome: string }[]): string {
  return papeis
    .map((p) => p.nome)
    .sort((a, b) => a.localeCompare(b))
    .join(', ');
}

/** Só atribui um papel quem tem todas as permissões dele; papel de acesso total, só o Administrador. */
function podeAtribuir(ator: PrincipalUsuario, papel: PapelDetalhe): boolean {
  if (ator.acessoTotal) return true;
  return !papel.acessoTotal && papel.permissoes.every((chave) => temPermissao(ator, chave));
}
