import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../clock';
import type { PrincipalUsuario } from '../principal';
import { hashDoToken } from './abrir-sessao';
import { SESSAO_INATIVIDADE_MS, SESSAO_RENOVACAO_MINIMA_MS } from './politica-sessao';
import { SESSOES_REPOSITORY, type SessoesAutenticacaoRepository } from './sessoes.repository';

/** Transforma o token do cookie em quem está logado, renovando a sessão a cada uso. */
@Injectable()
export class SessaoAutenticador {
  private readonly logger = new Logger(SessaoAutenticador.name);

  constructor(
    @Inject(SESSOES_REPOSITORY) private readonly sessoes: SessoesAutenticacaoRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `null` quando o token não abre uma sessão válida (desconhecido, expirado, encerrado, conta inativa). */
  async autenticar(token: string): Promise<PrincipalUsuario | null> {
    const agora = this.clock.now();
    const sessao = await this.sessoes.buscarParaAutenticar(hashDoToken(token));
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
      // Sem esperar: a sessão já foi validada, e a renovação só empurra a expiração de 7 dias.
      // Se falhar, a próxima requisição (≥ 1 min depois) tenta de novo.
      this.sessoes.renovar(sessao.id, expiraEm, agora).catch((erro: unknown) => {
        this.logger.warn(
          `Falha ao renovar a sessão ${sessao.id}: ${erro instanceof Error ? erro.message : erro}`,
        );
      });
    }

    const { acesso } = sessao;
    return {
      tipo: 'usuario',
      usuarioId: sessao.usuarioId,
      sessaoId: sessao.id,
      nome: sessao.usuario.nome,
      email: sessao.usuario.email,
      papeis: acesso.papeis,
      acessoTotal: acesso.acessoTotal,
      permissoes: new Set(acesso.permissoes),
    };
  }
}
