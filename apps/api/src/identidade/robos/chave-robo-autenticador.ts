import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type Clock } from '../clock';
import type { PrincipalRobo } from '../principal';
import { hashDoToken } from '../sessoes/abrir-sessao';
import { SESSAO_RENOVACAO_MINIMA_MS } from '../sessoes/politica-sessao';
import { CHAVES_ROBO_REPOSITORY, type ChavesRoboRepository } from './chaves-robo.repository';

/** Transforma a chave enviada pelo robô no principal dele, registrando o último uso. */
@Injectable()
export class ChaveRoboAutenticador {
  constructor(
    @Inject(CHAVES_ROBO_REPOSITORY) private readonly chaves: ChavesRoboRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** `null` para chave desconhecida, revogada ou vencida. */
  async autenticar(chave: string, ip: string): Promise<PrincipalRobo | null> {
    const agora = this.clock.now();
    const encontrada = await this.chaves.buscarPorHash(hashDoToken(chave));
    if (
      !encontrada ||
      encontrada.revogadaEm ||
      (encontrada.expiraEm && encontrada.expiraEm <= agora)
    ) {
      return null;
    }
    const ultimo = encontrada.ultimoUsoEm?.getTime() ?? 0;
    if (agora.getTime() - ultimo >= SESSAO_RENOVACAO_MINIMA_MS) {
      await this.chaves.registrarUso(encontrada.id, agora, ip);
    }
    return {
      tipo: 'robo',
      chaveId: encontrada.id,
      nome: encontrada.nome,
      acessoTotal: false,
      permissoes: new Set(encontrada.permissoes),
    };
  }
}
