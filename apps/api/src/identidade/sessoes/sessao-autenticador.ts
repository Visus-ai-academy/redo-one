import { Inject, Injectable } from '@nestjs/common';

import { hashDoToken } from '../autenticacao/autenticacao.service';
import { CLOCK, type Clock } from '../clock';
import { PAPEIS_REPOSITORY, type PapeisRepository } from '../papeis/papeis.repository';
import type { PrincipalUsuario } from '../principal';
import { SESSAO_INATIVIDADE_MS, SESSAO_RENOVACAO_MINIMA_MS } from './politica-sessao';
import { SESSOES_REPOSITORY, type SessoesRepository } from './sessoes.repository';

/** Transforma o token do cookie em quem está logado, renovando a sessão a cada uso. */
@Injectable()
export class SessaoAutenticador {
  constructor(
    @Inject(SESSOES_REPOSITORY) private readonly sessoes: SessoesRepository,
    @Inject(PAPEIS_REPOSITORY) private readonly papeis: PapeisRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `null` quando o token não abre uma sessão válida (desconhecido, expirado, encerrado, conta inativa). */
  async autenticar(token: string): Promise<PrincipalUsuario | null> {
    const agora = this.clock.now();
    const sessao = await this.sessoes.buscarPorTokenHash(hashDoToken(token));
    if (
      !sessao ||
      sessao.encerradaEm ||
      sessao.expiraEm <= agora ||
      sessao.expiraAbsolutoEm <= agora ||
      !sessao.usuario.ativo
    ) {
      return null;
    }

    if (agora.getTime() - sessao.ultimoUsoEm.getTime() >= SESSAO_RENOVACAO_MINIMA_MS) {
      const expiraEm = new Date(
        Math.min(agora.getTime() + SESSAO_INATIVIDADE_MS, sessao.expiraAbsolutoEm.getTime()),
      );
      await this.sessoes.renovar(sessao.id, expiraEm, agora);
    }

    const acesso = await this.papeis.acessoDoPapel(sessao.usuario.papelId);
    return {
      tipo: 'usuario',
      usuarioId: sessao.usuarioId,
      sessaoId: sessao.id,
      nome: sessao.usuario.nome,
      email: sessao.usuario.email,
      papelId: sessao.usuario.papelId,
      acessoTotal: acesso.acessoTotal,
      permissoes: new Set(acesso.permissoes),
    };
  }
}
