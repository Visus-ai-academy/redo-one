import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { CLOCK, type Clock } from '../clock';
import type { PrincipalUsuario } from '../principal';
import { hashDoToken } from '../sessoes/abrir-sessao';
import { ChaveRoboNaoEncontradaError, PermissaoDeRoboInvalidaError } from './chaves-robo.errors';
import {
  CHAVES_ROBO_REPOSITORY,
  type ChaveRobo,
  type ChavesRoboRepository,
  type DadosRobo,
} from './chaves-robo.repository';
import { existePermissaoRobo } from './permissoes-robo';

const DIA = 24 * 60 * 60 * 1000;

/** A chave inteira: só existe nesta resposta. Quem cria guarda no cofre do servidor do robô. */
export interface ChaveCriada {
  id: string;
  chave: string;
}

@Injectable()
export class ChavesRoboService {
  constructor(
    @Inject(CHAVES_ROBO_REPOSITORY) private readonly chaves: ChavesRoboRepository,
    @Inject(AUDITORIA) private readonly auditoria: Auditoria,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  listar(): Promise<ChaveRobo[]> {
    return this.chaves.listar();
  }

  async criar(
    ator: PrincipalUsuario,
    dados: DadosRobo & { validadeDias: number | null },
  ): Promise<ChaveCriada> {
    const invalidas = dados.permissoes.filter((p) => !existePermissaoRobo(p));
    if (invalidas.length) throw new PermissaoDeRoboInvalidaError(invalidas);

    const agora = this.clock.now();
    const chave = `one_${randomBytes(32).toString('base64url')}`;
    const permissoes = [...new Set(dados.permissoes)].sort();
    const id = await this.chaves.criar({
      nome: dados.nome.trim(),
      descricao: dados.descricao?.trim() || null,
      permissoes,
      prefixo: chave.slice(0, 12),
      tokenHash: hashDoToken(chave),
      expiraEm: dados.validadeDias ? new Date(agora.getTime() + dados.validadeDias * DIA) : null,
      criadaPorId: ator.usuarioId,
      criadaEm: agora,
    });
    await this.auditar(ator, id, 'criada', { nome: dados.nome, permissoes });
    return { id, chave };
  }

  /** Outra chave ativa para o mesmo robô, com a mesma validade; a antiga vale até ser revogada. */
  async gerarNova(ator: PrincipalUsuario, id: string): Promise<ChaveCriada> {
    const atual = await this.obter(id);
    const validadeDias = atual.expiraEm
      ? Math.round((atual.expiraEm.getTime() - atual.criadaEm.getTime()) / DIA)
      : null;
    return this.criar(ator, { ...atual, validadeDias });
  }

  async revogar(ator: PrincipalUsuario, id: string): Promise<void> {
    await this.obter(id);
    await this.chaves.revogar(id, this.clock.now());
    await this.auditar(ator, id, 'revogada');
  }

  private async obter(id: string): Promise<ChaveRobo> {
    const chave = await this.chaves.buscar(id);
    if (!chave) throw new ChaveRoboNaoEncontradaError();
    return chave;
  }

  private auditar(
    ator: PrincipalUsuario,
    chaveId: string,
    acao: string,
    depois?: Record<string, unknown>,
  ) {
    return this.auditoria.registrar({
      ator: { tipo: 'usuario', id: ator.usuarioId },
      entidade: 'chave_robo',
      entidadeId: chaveId,
      acao,
      depois,
      em: this.clock.now(),
    });
  }
}
