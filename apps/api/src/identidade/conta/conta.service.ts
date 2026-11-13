import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { CLOCK, type Clock } from '../clock';
import type { PrincipalUsuario } from '../principal';
import { PASSWORD_HASHER, type PasswordHasher } from '../senha/password-hasher';
import { problemasDaSenha } from '../senha/politica-senha';
import { SenhaFracaError } from '../senha/senha.errors';
import { SESSOES_REPOSITORY, type SessoesRepository } from '../sessoes/sessoes.repository';
import {
  GESTAO_USUARIOS_REPOSITORY,
  type GestaoUsuariosRepository,
  type SessaoAbertaResumo,
} from '../usuarios/gestao-usuarios.repository';
import { SessaoNaoEncontradaError, UsuarioNaoEncontradoError } from '../usuarios/usuarios.errors';
import { SenhaAtualIncorretaError } from './conta.errors';
import { type AcessoRecente, CONTA_REPOSITORY, type ContaRepository } from './conta.repository';

const DIA = 24 * 60 * 60 * 1000;

export interface MinhaConta {
  nome: string;
  email: string;
  cpfFinal: string | null;
  papel: { id: string; nome: string };
  senhaAlteradaEm: Date | null;
  sessoesAbertas: (SessaoAbertaResumo & { atual: boolean })[];
}

/** Meu perfil: o que a própria pessoa vê e muda na conta dela. */
@Injectable()
export class ContaService {
  constructor(
    @Inject(GESTAO_USUARIOS_REPOSITORY) private readonly usuarios: GestaoUsuariosRepository,
    @Inject(CONTA_REPOSITORY) private readonly conta: ContaRepository,
    @Inject(SESSOES_REPOSITORY) private readonly sessoes: SessoesRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(AUDITORIA) private readonly auditoria: Auditoria,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async obter(eu: PrincipalUsuario): Promise<MinhaConta> {
    const usuario = await this.usuarios.buscar(eu.usuarioId, this.clock.now());
    if (!usuario) throw new UsuarioNaoEncontradoError();
    const { alteradaEm } = await this.conta.senha(eu.usuarioId);
    const sessoesAbertas = usuario.sessoesAbertas
      .map((s) => ({ ...s, atual: s.id === eu.sessaoId }))
      .sort((a, b) => Number(b.atual) - Number(a.atual));
    return {
      nome: usuario.nome,
      email: usuario.email,
      cpfFinal: usuario.cpfFinal,
      papel: usuario.papel,
      senhaAlteradaEm: alteradaEm,
      sessoesAbertas,
    };
  }

  async atualizarNome(eu: PrincipalUsuario, nome: string): Promise<void> {
    const novo = nome.trim();
    await this.conta.atualizarNome(eu.usuarioId, novo);
    await this.auditar(eu, 'nome_alterado', { nome: eu.nome }, { nome: novo });
  }

  /** Confere a senha atual, grava a nova e encerra as outras sessões (a atual continua). */
  async trocarSenha(
    eu: PrincipalUsuario,
    dados: { senhaAtual: string; novaSenha: string },
  ): Promise<{ sessoesEncerradas: number }> {
    const { hash } = await this.conta.senha(eu.usuarioId);
    if (!hash || !(await this.hasher.verify(hash, dados.senhaAtual))) {
      throw new SenhaAtualIncorretaError();
    }
    const problemas = problemasDaSenha(dados.novaSenha);
    if (problemas.length) throw new SenhaFracaError(problemas);

    const agora = this.clock.now();
    await this.conta.trocarSenha(eu.usuarioId, await this.hasher.hash(dados.novaSenha), agora);
    const sessoesEncerradas = await this.sessoes.encerrarDoUsuario(
      eu.usuarioId,
      agora,
      eu.sessaoId,
    );
    await this.auditar(eu, 'senha_trocada');
    return { sessoesEncerradas };
  }

  /** Com `sessaoId`, encerra só ela (se for da pessoa); sem, encerra todas as outras. */
  async encerrarSessoes(eu: PrincipalUsuario, sessaoId?: string): Promise<void> {
    const agora = this.clock.now();
    if (!sessaoId) {
      await this.sessoes.encerrarDoUsuario(eu.usuarioId, agora, eu.sessaoId);
      return;
    }
    const usuario = await this.usuarios.buscar(eu.usuarioId, agora);
    if (!usuario?.sessoesAbertas.some((s) => s.id === sessaoId)) {
      throw new SessaoNaoEncontradaError();
    }
    await this.sessoes.encerrar(sessaoId, agora);
  }

  acessosRecentes(eu: PrincipalUsuario): Promise<AcessoRecente[]> {
    const desde = new Date(this.clock.now().getTime() - 30 * DIA);
    return this.conta.acessosRecentes(eu.usuarioId, desde, 50);
  }

  private auditar(
    eu: PrincipalUsuario,
    acao: string,
    antes?: Record<string, unknown>,
    depois?: Record<string, unknown>,
  ) {
    return this.auditoria.registrar({
      ator: { tipo: 'usuario', id: eu.usuarioId },
      entidade: 'usuario',
      entidadeId: eu.usuarioId,
      acao,
      antes,
      depois,
      em: this.clock.now(),
    });
  }
}
